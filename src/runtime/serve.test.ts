import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { CommandErrorResult } from "../types/result";
import { GunsmithError } from "../errors";
import cli from "../index";
import { runCli, runJson } from "../testing/testkit";

const expectCommandErrorResult = (json: unknown): CommandErrorResult => {
  expect(json).toMatchObject({ ok: false });
  return json as CommandErrorResult;
};

const createGreetCli = () =>
  cli.create("greet", {
    description: "Greet someone",
    args: z.object({ name: z.string() }),
    options: z.object({ loud: z.boolean().default(false), times: z.coerce.number().default(1) }),
    run: ({ args, options }) => {
      const line = options.loud ? `hello ${args.name}`.toUpperCase() : `hello ${args.name}`;
      console.log(line); // suppressed under --json
      return { message: line, times: options.times };
    },
  });

const createDemoCli = () => {
  const app = cli.create("demo", { version: "1.2.3", description: "demo" });
  const task = cli.command("task", { description: "tasks" });
  task.command("list", {
    options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
    run: ({ options }) => ({ tasks: [], state: options.state }),
  });
  task.command("secret", { hidden: true, run: () => {} });
  app.command(task);
  app.command("status", { run: () => ({ clean: true }) });
  return app;
};

describe("output: human by default, structured opt-in", () => {
  test("regular run prints the handler's own output; no result", async () => {
    const r = await runCli(createGreetCli(), ["Ada"]);
    expect(r.stdout).toBe("hello Ada\n");
    expect(r.json).toBeUndefined();
    expect(r.exitCode).toBe(0);
  });
  test("human output that looks like a result is still human output", async () => {
    const app = cli.create("x", {
      run: () => console.log(JSON.stringify({ ok: true, data: { human: true } })),
    });
    const r = await runCli(app, []);
    expect(r.stdout).toBe('{"ok":true,"data":{"human":true}}\n');
    expect(r.json).toBeUndefined();
  });
  test("piping does NOT switch to JSON — still the handler's text", async () => {
    const r = await runCli(createGreetCli(), ["Ada"], { isTTY: false });
    expect(r.stdout).toBe("hello Ada\n");
  });
  test("--json emits the returned result (and the handler suppresses its print)", async () => {
    const r = await runJson(createGreetCli(), ["Ada", "--loud"]);
    expect(r.stdout).toBe('{"message":"HELLO ADA","times":1}\n');
  });
  test("a command that returns nothing emits an empty result under --json", async () => {
    const app = cli.create("x", { run: () => {} });
    const r = await runJson(app, []);
    expect(r.json).toBeNull();
  });
});

describe("result resolution", () => {
  test("console.log is suppressed under --json; only the result reaches stdout", async () => {
    const a = cli.create("x", {
      run: () => {
        console.log("human noise");
        return { data: 1 };
      },
    });
    const human = await runCli(a, []);
    expect(human.stdout).toBe("human noise\n");
    expect(human.json).toBeUndefined();
    const json = await runJson(a, []);
    expect(json.stdout).toBe('{"data":1}\n');
  });
  test("outputSchema accepts a valid returned result", async () => {
    const a = cli.create("x", {
      outputSchema: z.object({ count: z.number() }),
      run: () => ({ count: 2 }),
    });
    const result = await runJson(a, []);
    expect(result.json).toEqual({ count: 2 });
  });
  test("outputSchema validates returned data by default in development", async () => {
    const a = cli.create("x", {
      outputSchema: z.object({ count: z.number() }),
      run: () => ({ count: "two" }) as never,
    });
    const result = await runJson(a, [], { env: { NODE_ENV: "development" } });
    expect(result.exitCode).toBe(2);
    expect(expectCommandErrorResult(result.json).error).toMatchObject({ code: "VALIDATION" });
  });
  test("outputSchema passes through invalid returned data without development env by default", async () => {
    const a = cli.create("x", {
      outputSchema: z.object({ count: z.number() }),
      run: () => ({ count: "two" }) as never,
    });
    const result = await runJson(a, []);
    expect(result.json).toEqual({ count: "two" });
  });
  test("validateOutput true validates in production", async () => {
    const a = cli.create("x", {
      outputSchema: z.object({ count: z.number() }),
      validateOutput: true,
      run: () => ({ count: "two" }) as never,
    });
    const result = await runJson(a, [], { env: { NODE_ENV: "production" } });
    expect(result.exitCode).toBe(2);
    expect(expectCommandErrorResult(result.json).error).toMatchObject({ code: "VALIDATION" });
  });
  test("validateOutput false skips validation", async () => {
    const a = cli.create("x", {
      outputSchema: z.object({ count: z.number() }),
      validateOutput: false,
      run: () => ({ count: "two" }) as never,
    });
    const result = await runJson(a, []);
    expect(result.json).toEqual({ count: "two" });
  });
});

describe("parsing & validation", () => {
  test("coercion success (structured)", async () => {
    const r = await runJson(createGreetCli(), ["Ada", "--times", "3"]);
    expect(r.json).toMatchObject({ times: 3 });
  });
  test("coercion failure -> VALIDATION exit 2 with z.coerce hint", async () => {
    const r = await runJson(createGreetCli(), ["Ada", "--times", "nope"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.code).toBe("VALIDATION");
    expect(expectCommandErrorResult(r.json).error.message).toContain("z.coerce.number()");
  });
  test("human-mode validation error goes to stderr, exit 2", async () => {
    const r = await runCli(createGreetCli(), ["Ada", "--lod"]);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain('unknown option "--lod"; did you mean "--loud"?');
  });
  test("single-dash tokens are parsed as arguments, not options", async () => {
    const r = await runCli(createGreetCli(), ["Ada", "-p"]);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe('error (VALIDATION): unexpected argument "-p"\n');
  });
  test("single-dash strings can be option values", async () => {
    const app = cli.create("x", {
      options: z.object({ prefix: z.string() }),
      run: ({ options }) => options,
    });
    const r = await runJson(app, ["--prefix", "-literal"]);
    expect(r.exitCode).toBe(0);
    expect(r.json).toEqual({ prefix: "-literal" });
  });
  test("required arg missing -> exit 2", async () => {
    const r = await runJson(createGreetCli(), []);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.code).toBe("VALIDATION");
  });
  test("excess positional -> exit 2", async () => {
    const r = await runJson(createGreetCli(), ["Ada", "Bob"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.message).toContain("unexpected argument");
  });
});

describe("subcommands", () => {
  test("nested resolution", async () => {
    const r = await runJson(createDemoCli(), ["task", "list", "--state", "closed"]);
    expect(r.json).toEqual({ tasks: [], state: "closed" });
  });
  test("unknown command -> COMMAND_NOT_FOUND + did-you-mean", async () => {
    const r = await runJson(createDemoCli(), ["task", "lst"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.code).toBe("COMMAND_NOT_FOUND");
    expect(expectCommandErrorResult(r.json).error.message).toContain('did you mean "list"');
  });
  test("bare parent command prints help (exit 0)", async () => {
    const r = await runCli(createDemoCli(), ["task"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage: demo task <command>");
    expect(r.stdout).toContain("list");
  });
});

describe("globals", () => {
  test("--version", async () => {
    const r = await runCli(createDemoCli(), ["--version"]);
    expect(r.stdout).toBe("1.2.3\n");
  });
  test("help skips hidden commands", async () => {
    const r = await runCli(createDemoCli(), ["task", "--help"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.stdout).toContain("list");
    expect(r.stdout).not.toContain("secret");
  });
});

describe("exit codes", () => {
  test("thrown GunsmithError -> structured failure", async () => {
    const app = cli.create("x", {
      run: () => {
        throw new GunsmithError("VALIDATION", "bad");
      },
    });
    const r = await runJson(app, []);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error).toEqual({ code: "VALIDATION", message: "bad" });
  });
  test("thrown GunsmithError -> stderr in human mode", async () => {
    const app = cli.create("x", {
      run: () => {
        throw new GunsmithError("VALIDATION", "bad");
      },
    });
    const r = await runCli(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toBe("error (VALIDATION): bad\n");
  });
  test("thrown handler error -> UNKNOWN exit 1; human stderr", async () => {
    const app = cli.create("x", {
      run: () => {
        throw new Error("boom");
      },
    });
    const human = await runCli(app, []);
    expect(human.exitCode).toBe(1);
    expect(human.stderr).toContain("boom");
    const structured = await runJson(app, []);
    expect(expectCommandErrorResult(structured.json).error).toEqual({ code: "UNKNOWN", message: "boom" });
  });
});

describe("context", () => {
  test("rest passthrough after -- (note: --json must precede --)", async () => {
    const app = cli.create("x", { run: ({ rest }) => ({ rest }) });
    const r = await runCli(app, ["--json", "--", "a", "-b", "--c"]);
    expect(r.json).toEqual({ rest: ["a", "-b", "--c"] });
  });
  test("readStdin", async () => {
    const app = cli.create("x", {
      run: async ({ readStdin }) => ({ piped: await readStdin() }),
    });
    const r = await runJson(app, [], { stdin: "hello stdin" });
    expect(r.json).toEqual({ piped: "hello stdin" });
  });
  test("env schema from injected env", async () => {
    const app = cli.create("x", {
      env: z.object({ TOKEN: z.string(), HOST: z.string().default("localhost") }),
      run: ({ env }) => ({ token: env.TOKEN, host: env.HOST }),
    });
    const r = await runJson(app, [], { env: { TOKEN: "secret" } });
    expect(r.json).toEqual({ token: "secret", host: "localhost" });
  });
  test("isTTY reflects the terminal; isJSON reflects --json", async () => {
    const app = cli.create("x", { run: ({ isTTY, isJSON }) => ({ isTTY, isJSON }) });
    const nonTty = await runJson(app, []);
    const tty = await runJson(app, [], { isTTY: true });
    expect(nonTty.json).toEqual({ isTTY: false, isJSON: true });
    expect(tty.json).toEqual({ isTTY: true, isJSON: true });
  });
});
