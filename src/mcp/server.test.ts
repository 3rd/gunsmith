import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const FIXTURE_PATH = path.join(import.meta.dir, "fixtures", "abortable-cli.ts");

const markerDirectories: string[] = [];

afterEach(async () => {
  for (const directory of markerDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const startWaitingCall = async (interrupt: "abort" | "exit") => {
  const markerDirectory = await mkdtemp(path.join(os.tmpdir(), "gunsmith-mcp-server-"));
  markerDirectories.push(markerDirectory);
  const markerPath = path.join(markerDirectory, "cleanup");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [FIXTURE_PATH, "--mcp"],
    env: { ...getDefaultEnvironment(), FIXTURE_INTERRUPT: interrupt },
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
  const serverPid = transport.pid;
  if (serverPid === null) throw new Error("the MCP server process has no pid");

  const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
  const callSettled = client
    .callTool({ name: "wait", arguments: { markerPath } }, undefined, { onprogress: () => markStarted() })
    .then(
      () => undefined,
      () => undefined,
    );
  await started;

  return { client, serverPid, markerPath, callSettled };
};

describe("serveMcp over stdio", () => {
  test("closing stdin cancels any running call before the server exits", async () => {
    const { client, markerPath, callSettled } = await startWaitingCall("exit");

    await client.close();
    await callSettled;
    expect(await readFile(markerPath, "utf8")).toBe("cleaned up");
  });

  test("SIGTERM aborts calls to interrupt: abort commands instead of killing the server", async () => {
    const { client, serverPid, markerPath, callSettled } = await startWaitingCall("abort");
    const { promise: exited, resolve: markExited } = Promise.withResolvers<void>();
    client.onclose = markExited;

    process.kill(serverPid, "SIGTERM");
    await exited;
    await callSettled;
    expect(await readFile(markerPath, "utf8")).toBe("cleaned up");
  });
});
