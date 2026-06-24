import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import cli, { Cli, command, create } from "../dist/index.js";
import { runCli, runJson } from "../dist/testing/testkit.js";

const app = cli.create("greet", {
  args: z.object({ name: z.string() }),
  options: z.object({ loud: z.boolean().default(false) }),
  run: ({ args, options }) => {
    const msg = options.loud ? `HI ${args.name}` : `hi ${args.name}`;
    console.log(msg);
    return { message: msg };
  },
});
assert.equal(create, cli.create);
assert.equal(command, cli.command);
assert.equal(typeof Cli, "function");

// human: the handler's output, no result
const human = await runCli(app, ["World", "--loud"]);
assert.equal(human.exitCode, 0);
assert.equal(human.stdout, "HI World\n");
assert.equal(human.json, undefined);

// structured: opt-in result, console suppressed
const json = await runJson(app, ["World", "--loud"]);
assert.deepEqual(json.json, { message: "HI World" });
assert.equal(json.stdout, '{"message":"HI World"}\n');

// CJS interop: top-level create(), default export, and named exports
const require = createRequire(import.meta.url);
const cjs = require("../dist/index.cjs");
assert.equal(typeof cjs.create, "function");
assert.equal(cjs.create, cjs.default.create);
assert.equal(cjs.command, cjs.default.command);
assert.equal(typeof cjs.default.create, "function");
assert.equal(typeof cjs.Cli, "function");

// package exports
const publicCore = await import("@andrei.fyi/picocli");
assert.equal(typeof publicCore.default.create, "function");
assert.equal(typeof publicCore.create, "function");
assert.equal(publicCore.create, publicCore.default.create);
assert.equal(publicCore.command, publicCore.default.command);
assert.equal(typeof publicCore.Cli, "function");

const publicTesting = await import("@andrei.fyi/picocli/testing");
assert.equal(typeof publicTesting.runCli, "function");
assert.equal(typeof publicTesting.runJson, "function");

const publicMcp = await import("@andrei.fyi/picocli/mcp");
assert.equal(typeof publicMcp.listTools, "function");
assert.equal(typeof publicMcp.invokeTool, "function");
assert.equal(typeof publicMcp.buildServer, "function");

const packageCjs = require("@andrei.fyi/picocli");
assert.equal(typeof packageCjs.create, "function");
assert.equal(packageCjs.create, packageCjs.default.create);
assert.equal(packageCjs.command, packageCjs.default.command);
assert.equal(typeof packageCjs.default.create, "function");
assert.equal(typeof packageCjs.Cli, "function");

const testingCjs = require("@andrei.fyi/picocli/testing");
assert.equal(typeof testingCjs.runCli, "function");
assert.equal(typeof testingCjs.runJson, "function");

const mcpCjs = require("@andrei.fyi/picocli/mcp");
assert.equal(typeof mcpCjs.listTools, "function");
assert.equal(typeof mcpCjs.invokeTool, "function");
assert.equal(typeof mcpCjs.buildServer, "function");

// packaged --mcp lazy dynamic import and stdio
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "picocli-mcp-smoke-"));
const mcpCli = path.join(tmp, "cli.mjs");
fs.writeFileSync(
  mcpCli,
  `import cli from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};
cli.create("smoke", { run: () => ({ pong: true }) }).serve();
`,
);
const client = new Client({ name: "smoke", version: "1.0.0" });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [mcpCli, "--mcp"] }));
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    ["smoke"],
  );
  const called = await client.callTool({ name: "smoke", arguments: {} });
  assert.deepEqual(called.structuredContent, { ok: true, data: { pong: true } });
} finally {
  await client.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// MCP SDK not in the core entry graph
for (const f of ["dist/index.js", "dist/index.cjs"]) {
  const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.ok(!src.includes("@modelcontextprotocol"), `${f} must not reference the MCP SDK`);
}

console.log(`smoke ok (${typeof Bun !== "undefined" ? "bun" : "node"})`);
