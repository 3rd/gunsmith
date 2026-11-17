import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import cli, { Cli, type ProgressUpdate } from "../index";
import { buildServer, invokeTool, listTools } from "./index";

const createDemoCli = () => {
  const root = cli.create("demo", { version: "1.0.0" });
  const task = cli.command("task", { description: "tasks" });
  task.command("list", {
    description: "list tasks",
    options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
    run: ({ options }) => ({ tasks: [], state: options.state }),
  });
  task.command("secret", { hidden: true, run: () => {} });
  root.command(task);
  root.command("status", { run: () => ({ clean: true }) });
  return root;
};

const connectClient = async (root: Cli) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await buildServer(root).connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);

  return client;
};

const waitForAbort = (signal: AbortSignal) => {
  if (signal.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
};

const expectTextContent = (result: {
  content: { type: "text"; text: string }[];
  structuredContent: unknown;
}) => {
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(result.structuredContent) }]);
};

describe("listTools", () => {
  test("flattens nested names with _ and excludes hidden + non-runnable", () => {
    const tools = listTools(createDemoCli());
    expect(tools.map((t) => t.name)).toEqual(["task_list", "status"]);
    expect(Object.keys(tools.find((t) => t.name === "task_list")!.inputSchema.properties as object)).toEqual([
      "state",
    ]);
  });

  test("tool input schemas mark defaulted options optional", () => {
    const root = cli.create("app");
    root.command("convert", {
      options: z.object({ quiet: z.boolean().default(false), file: z.string() }),
      run: () => ({ ok: true }),
    });
    const tool = listTools(root).find((t) => t.name === "convert")!;
    const input = tool.inputSchema as { required?: string[] };
    expect(input.required).toEqual(["file"]);
  });

  test("inheritOptions: false excludes parent options from tool schemas and named input", async () => {
    const root = cli.create("app", { options: z.object({ port: z.coerce.number().default(3000) }) });
    root.command("isolated", {
      inheritOptions: false,
      options: z.object({ out: z.string().default("dist") }),
      run: ({ options }) => ({ options }),
    });
    root.command("inheriting", { run: () => ({ ok: true }) });
    const tools = listTools(root);
    expect(Object.keys(tools.find((t) => t.name === "isolated")!.inputSchema.properties as object)).toEqual([
      "out",
    ]);
    expect(Object.keys(tools.find((t) => t.name === "inheriting")!.inputSchema.properties as object)).toEqual(
      ["port"],
    );
    const rejected = await invokeTool(root, "isolated", { port: 4000 });
    expect(rejected.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: 'unknown tool argument "port"' },
    });
  });

  test("hidden parent commands hide their descendants", () => {
    const root = cli.create("app");
    const hidden = cli.command("internal", { hidden: true });
    hidden.command("run", { run: () => ({ ok: true }) });
    root.command(hidden);
    expect(listTools(root)).toEqual([]);
  });

  test("features.mcp=false excludes a command from tools but not from the CLI tree", () => {
    const root = cli.create("app");
    root.command("build", { run: () => ({ ok: true }) });
    root.command("purge", { features: { mcp: false }, run: () => ({ purged: true }) });
    expect(listTools(root).map((t) => t.name)).toEqual(["build"]);
  });

  test("root features.mcp=false removes every tool, including from programmatic listing", () => {
    const root = cli.create("app", { features: { mcp: false } });
    root.command("build", { run: () => ({ ok: true }) });
    expect(listTools(root)).toEqual([]);
  });

  test("a Cli constructed with a separate features argument filters tools from that argument", () => {
    const root = new Cli("app", {}, { mcp: false });
    root.command("build", { run: () => ({ ok: true }) });
    expect(listTools(root)).toEqual([]);
  });

  test("features.mcp=false on a parent excludes its descendants", () => {
    const root = cli.create("app");
    const internal = cli.command("internal", { features: { mcp: false } });
    internal.command("run", { run: () => ({ ok: true }) });
    root.command(internal);
    expect(listTools(root)).toEqual([]);
  });

  test("duplicate flattened tool names fail fast", () => {
    const root = cli.create("app");
    root.command("foo_bar", { run: () => {} });
    const foo = cli.command("foo");
    foo.command("bar", { run: () => {} });
    root.command(foo);
    expect(() => listTools(root)).toThrow("duplicate MCP tool name: foo_bar");
  });

  test("command alias/name collisions fail fast", () => {
    const root = cli.create("app");
    root.command("list", { alias: "ls", run: () => {} });
    root.command("ls", { run: () => {} });
    expect(() => listTools(root)).toThrow('command name "ls" for "ls" conflicts with command "list"');
  });

  test("duplicate arg/option input names fail fast", () => {
    const root = cli.create("app");
    root.command("run", {
      args: z.object({ name: z.string() }),
      options: z.object({ name: z.string().default("x") }),
      run: () => {},
    });
    expect(() => listTools(root)).toThrow("schema fields must be unique");
  });

  test("tool listings carry the command's annotations", async () => {
    const root = cli.create("app");
    root.command("scan", {
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      run: () => ({}),
    });
    root.command("status", { run: () => ({}) });

    const expected = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
    expect(listTools(root).map((tool) => tool.annotations)).toEqual([expected, undefined]);

    const client = await connectClient(root);
    const listed = await client.listTools();
    await client.close();
    expect(listed.tools.map((tool) => tool.annotations)).toEqual([expected, undefined]);
  });

  test("includes outputSchema for commands that define one", () => {
    const root = cli.create("app");
    root.command("status", {
      outputSchema: z.object({ clean: z.boolean() }),
      run: () => ({ clean: true }),
    });
    const tool = listTools(root)[0]!;
    expect(tool.outputSchema).toMatchObject({
      type: "object",
      anyOf: [
        {
          type: "object",
          properties: {
            ok: { const: true },
            data: {
              type: "object",
              properties: { clean: { type: "boolean" } },
              required: ["clean"],
            },
          },
          required: ["ok", "data"],
        },
        {
          type: "object",
          properties: {
            ok: { const: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
          required: ["ok", "error"],
        },
      ],
    });
  });
});

describe("invokeTool", () => {
  test("runs the command and returns a structured result", async () => {
    const res = await invokeTool<{ tasks: unknown[]; state: string }>(createDemoCli(), "task_list", {
      state: "closed",
    });
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ ok: true, data: { tasks: [], state: "closed" } });
    expectTextContent(res);
  });

  test("invalid args -> isError result with validation details", async () => {
    const res = await invokeTool(createDemoCli(), "task_list", { state: "bogus" });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expectTextContent(res);
  });

  test("unknown args -> validation result", async () => {
    const res = await invokeTool(createDemoCli(), "task_list", { stete: "closed" });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: 'unknown tool argument "stete"' },
    });
  });

  test("duplicate arg/option input names fail during invocation", async () => {
    const root = cli.create("app");
    root.command("run", {
      args: z.object({ name: z.string() }),
      options: z.object({ name: z.string().default("x") }),
      run: () => {},
    });
    const res = await invokeTool(root, "run", { name: "Ada" });
    expect(res).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { code: "VALIDATION", message: "schema fields must be unique across merged inputs: name" },
      },
    });
  });

  test("runs a top-level command", async () => {
    const res = await invokeTool(createDemoCli(), "status", {});
    expect(res.structuredContent).toMatchObject({ ok: true, data: { clean: true } });
  });

  test("runs a runnable root command", async () => {
    const root = cli.create("root", { run: () => ({ root: true }) });
    const res = await invokeTool(root, "root", {});
    expect(res.structuredContent).toMatchObject({ ok: true, data: { root: true } });
  });

  test("thrown handler -> isError UNKNOWN result", async () => {
    const root = cli.create("t");
    root.command("boom", {
      run: () => {
        throw new Error("kaboom");
      },
    });
    const res = await invokeTool(root, "boom", {});
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });

  test("unknown tool returns a command-not-found result", async () => {
    const res = await invokeTool(createDemoCli(), "missing", {});
    expect(res).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { code: "COMMAND_NOT_FOUND", message: "unknown tool: missing" },
      },
    });
  });

  test("a features.mcp=false command cannot be invoked as a tool", async () => {
    const root = cli.create("app");
    root.command("purge", { features: { mcp: false }, run: () => ({ purged: true }) });
    const res = await invokeTool(root, "purge", {});
    expect(res).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { code: "COMMAND_NOT_FOUND", message: "unknown tool: purge" },
      },
    });
  });
});

describe("tool call cancellation and progress", () => {
  test("a client's cancellation aborts only that call's signal", async () => {
    const firstHandlerSignal = Promise.withResolvers<AbortSignal>();
    const secondHandlerSignal = Promise.withResolvers<AbortSignal>();
    const handlerSignalsById = { first: firstHandlerSignal, second: secondHandlerSignal };
    const root = cli.create("app");
    root.command("wait", {
      args: z.object({ id: z.enum(["first", "second"]) }),
      run: async ({ args, signal }) => {
        handlerSignalsById[args.id].resolve(signal);
        await waitForAbort(signal);

        return { id: args.id };
      },
    });

    const client = await connectClient(root);
    const first = new AbortController();
    const settle = (call: Promise<unknown>) => call.then(() => undefined, () => undefined);
    const firstCall = settle(
      client.callTool({ name: "wait", arguments: { id: "first" } }, undefined, { signal: first.signal }),
    );
    const secondCall = settle(client.callTool({ name: "wait", arguments: { id: "second" } }));
    const [firstSignal, secondSignal] = await Promise.all([
      firstHandlerSignal.promise,
      secondHandlerSignal.promise,
    ]);

    first.abort();
    await waitForAbort(firstSignal);
    expect(secondSignal.aborted).toBe(false);

    await client.close();
    await Promise.all([firstCall, secondCall]);
  });

  test("progress updates become progress notifications when the client asks for them", async () => {
    const root = cli.create("app");
    root.command("scan", {
      run: ({ reportProgress }) => {
        reportProgress({ progress: 1, total: 2, message: "probing" });
        reportProgress({ progress: 2, total: 2 });

        return { done: true };
      },
    });

    const client = await connectClient(root);
    const updates: unknown[] = [];

    const result = await client.callTool({ name: "scan", arguments: {} }, undefined, {
      onprogress: (update) => {
        updates.push(update);
      },
    });
    await client.close();
    expect(result.structuredContent).toEqual({ ok: true, data: { done: true } });
    expect(updates).toEqual([{ progress: 1, total: 2, message: "probing" }, { progress: 2, total: 2 }]);
  });

  test("invokeTool passes its signal and progress callback to the handler", async () => {
    const root = cli.create("app");
    root.command("scan", {
      run: async ({ signal, reportProgress }) => {
        reportProgress({ progress: 1, message: "started" });
        await waitForAbort(signal);

        return { outcome: "cancelled" };
      },
    });

    const controller = new AbortController();
    const updates: ProgressUpdate[] = [];

    const result = await invokeTool(root, "scan", {}, {
      signal: controller.signal,
      onProgress: (update) => {
        updates.push(update);
        controller.abort();
      },
    });
    expect(result.structuredContent).toEqual({ ok: true, data: { outcome: "cancelled" } });
    expect(updates).toEqual([{ progress: 1, message: "started" }]);
  });
});

describe("inherited inputs in tools", () => {
  test("a tool's inputSchema includes the parent command's options", () => {
    const root = cli.create("app", { options: z.object({ verbose: z.boolean().default(false) }) });
    root.command("build", {
      options: z.object({ target: z.string() }),
      run: () => ({}),
    });
    const tool = listTools(root).find((x) => x.name === "build")!;
    expect(Object.keys(tool.inputSchema.properties as object).sort()).toEqual(["target", "verbose"]);
  });

  test("invokeTool validates inherited options and env", async () => {
    const root = cli.create("app", {
      options: z.object({ verbose: z.boolean().default(false) }),
      env: z.object({ TOKEN: z.string().default("none") }),
    });
    root.command("build", {
      run: ({ options, env }) => ({ ...options, token: env.TOKEN }),
    });
    const res = await invokeTool(root, "build", { verbose: true }, { env: { TOKEN: "secret" } });
    expect(res.structuredContent).toMatchObject({
      ok: true,
      data: { verbose: true, token: "secret" },
    });
  });
});
