import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { CommandErrorResult } from "../types/result";
import { GunsmithError, isGunsmithError, UsageError } from "../errors";
import cli from "../index";
import { runCli, runJson } from "../testing/testkit";

const expectCommandErrorResult = (json: unknown): CommandErrorResult => {
  expect(json).toMatchObject({ ok: false });
  return json as CommandErrorResult;
};

// bun-types declare .rejects matchers as void; at runtime they return a promise
const awaitRejection = (assertion: void) => assertion as unknown as Promise<void>;

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
    expect(r.stderr).toBe('error: unexpected argument "-p"\n');
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
    expect(r.stderr).toBe("error: bad\n");
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
  test("thrown UsageError -> exit 2, plain prefix, USAGE code in the envelope", async () => {
    const app = cli.create("x", {
      run: () => {
        throw new UsageError("--duration requires --record");
      },
    });
    const human = await runCli(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(human.exitCode).toBe(2);
    expect(human.stderr).toBe("error: --duration requires --record\n");
    const structured = await runJson(app, []);
    expect(structured.exitCode).toBe(2);
    expect(expectCommandErrorResult(structured.json).error).toEqual({
      code: "USAGE",
      message: "--duration requires --record",
    });
  });
  test("multi-line error messages render verbatim", async () => {
    const app = cli.create("x", {
      run: () => {
        throw new Error("line one\nline two");
      },
    });
    const r = await runCli(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe("error: line one\nline two\n");
  });
});

describe("short option aliases", () => {
  test("-h prints help via the built-in alias", async () => {
    const r = await runCli(createDemoCli(), ["-h"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage: demo");
  });
  test("option aliases from .meta({ alias }) parse like the long flags", async () => {
    const app = cli.create("x", {
      options: z.object({
        loud: z.boolean().default(false).meta({ alias: "l" }),
        times: z.coerce.number().default(1).meta({ alias: "t" }),
      }),
      run: ({ options }) => options,
    });
    const r = await runJson(app, ["-l", "-t", "3"]);
    expect(r.json).toEqual({ loud: true, times: 3 });
  });
  test("an option alias overrides the built-in -h", async () => {
    const app = cli.create("x", {
      options: z.object({ host: z.string().default("localhost").meta({ alias: "h" }) }),
      run: ({ options }) => options,
    });
    const r = await runJson(app, ["-h", "example.com"]);
    expect(r.json).toEqual({ host: "example.com" });
  });
  test("unaliased single-dash tokens are still arguments", async () => {
    const r = await runCli(createGreetCli(), ["Ada", "-p"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toBe('error: unexpected argument "-p"\n');
  });
  test("duplicate option aliases are a definition error", async () => {
    const app = cli.create("x", {
      options: z.object({
        alpha: z.boolean().default(false).meta({ alias: "a" }),
        all: z.boolean().default(false).meta({ alias: "a" }),
      }),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(app, [])).rejects.toThrow(
        'alias "a" for option "all" of "x" conflicts with option "alpha"',
      ),
    );
  });
  test("multi-letter option aliases are a definition error", async () => {
    const app = cli.create("x", {
      options: z.object({ all: z.boolean().default(false).meta({ alias: "all" }) }),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(app, [])).rejects.toThrow('invalid alias "all" for option "all" of "x"'),
    );
  });
  test("short aliases are recognized before subcommand names during resolution", async () => {
    const app = cli.create("app", {
      options: z.object({ target: z.string().default("dev").meta({ alias: "t" }) }),
    });
    app.command("run", { run: ({ options }) => ({ target: options.target }) });
    const short = await runJson(app, ["-t", "prod", "run"]);
    expect(short.json).toEqual({ target: "prod" });
    const long = await runJson(app, ["--target", "prod", "run"]);
    expect(long.json).toEqual({ target: "prod" });
  });
  test("unknown single-dash tokens before a subcommand still stop resolution", async () => {
    const app = cli.create("app");
    app.command("run", { run: () => ({ ok: true }) });
    const r = await runJson(app, ["-p", "run"]);
    expect(r.exitCode).toBe(2);
  });
});

describe("json/color feature toggles", () => {
  test("features.json=false rejects --json and --format as unknown options", async () => {
    const app = cli.create("x", { features: { json: false }, run: () => ({ ok: true }) });
    const r1 = await runCli(app, ["--json"]);
    expect(r1.exitCode).toBe(2);
    expect(r1.stderr).toContain('unknown option "--json"');
    const r2 = await runCli(app, ["--format", "json"]);
    expect(r2.exitCode).toBe(2);
    expect(r2.stderr).toContain('unknown option "--format"');
  });
  test("features.json=false hides --json/--format from help", async () => {
    const app = cli.create("x", { features: { json: false }, run: () => {} });
    const r = await runCli(app, ["--help"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.stdout).not.toContain("--json");
    expect(r.stdout).not.toContain("--format");
    expect(r.stdout).toContain("--color / --no-color");
  });
  test("features.json=false keeps the programmatic format option working", async () => {
    const app = cli.create("x", { features: { json: false }, run: () => ({ ok: true }) });
    const r = await runJson(app, []);
    expect(r.json).toEqual({ ok: true });
  });
  test("features.color=false rejects --color/--no-color and hides them from help", async () => {
    const app = cli.create("x", { features: { color: false }, run: () => {} });
    const r1 = await runCli(app, ["--no-color"]);
    expect(r1.exitCode).toBe(2);
    expect(r1.stderr).toContain('unknown option "--no-color"');
    const r2 = await runCli(app, ["--color"]);
    expect(r2.exitCode).toBe(2);
    expect(r2.stderr).toContain('unknown option "--color"');
    const help = await runCli(app, ["--help"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(help.stdout).not.toContain("--color");
  });
});

describe("shell completions", () => {
  test("--completions prints a script for each supported shell", async () => {
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const r = await runCli(createDemoCli(), ["--completions", shell]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("__complete");
      expect(r.stdout).toContain("demo");
    }
  });
  test("the fish script passes the current token explicitly so an empty token is not dropped", async () => {
    const r = await runCli(createDemoCli(), ["--completions", "fish"]);
    expect(r.stdout).toContain('"$current"');
  });
  test("--completions rejects unknown shells", async () => {
    const r = await runCli(createDemoCli(), ["--completions", "powershell"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('invalid --completions "powershell"');
  });
  test("--completions rejects binary names unsafe to interpolate into shell scripts", async () => {
    const app = cli.create("weird name; rm", { run: () => {} });
    const r = await runCli(app, ["--completions", "fish"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("completions are not available for binary name");
  });
  test("__complete is a reserved command name", async () => {
    const app = cli.create("x");
    app.command("__complete", { run: () => {} });
    await awaitRejection(
      expect(runCli(app, ["anything"])).rejects.toThrow('invalid command name "__complete"'),
    );
  });
  test("__complete does not advertise shadowed built-in aliases", async () => {
    const app = cli.create("x", {
      options: z.object({ host: z.string().default("localhost").meta({ alias: "h", description: "host" }) }),
      run: () => {},
    });
    const r = await runCli(app, ["__complete", "-"]);
    expect(r.stdout).toContain("-h\thost");
    expect(r.stdout).not.toContain("-h\tshow help");
  });
  test("__complete lists subcommands with descriptions, skipping hidden ones", async () => {
    const r = await runCli(createDemoCli(), ["__complete", ""]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("task\ttasks");
    expect(r.stdout).toContain("status");
    expect(r.stdout).not.toContain("secret");
  });
  test("__complete resolves nested subcommands", async () => {
    const r = await runCli(createDemoCli(), ["__complete", "task", ""]);
    expect(r.stdout).toContain("list");
    expect(r.stdout).not.toContain("secret");
  });
  test("__complete lists flags and aliases when the current word starts with a dash", async () => {
    const app = cli.create("x", {
      options: z.object({ yes: z.boolean().default(false).meta({ alias: "y", description: "confirm" }) }),
      run: () => {},
    });
    const r = await runCli(app, ["__complete", "-"]);
    expect(r.stdout).toContain("--yes\tconfirm");
    expect(r.stdout).toContain("-y\tconfirm");
    expect(r.stdout).toContain("--help");
    expect(r.stdout).toContain("-h");
  });
  test("__complete completes enum option values", async () => {
    const r = await runCli(createDemoCli(), ["__complete", "task", "list", "--state", ""]);
    expect(r.stdout.split("\n").filter(Boolean)).toEqual(["open", "closed"]);
  });
  test("__complete completes built-in --completions values", async () => {
    const completions = await runCli(createDemoCli(), ["__complete", "--completions", ""]);
    expect(completions.stdout.split("\n").filter(Boolean)).toEqual(["bash", "fish", "zsh"]);
  });
  test("__complete emits nothing after the -- terminator", async () => {
    const r = await runCli(createDemoCli(), ["__complete", "--", ""]);
    expect(r.stdout).toBe("");
    expect(r.exitCode).toBe(0);
  });
  test("features.completions=false disables the flag and the __complete hook", async () => {
    const app = cli.create("x", { features: { completions: false }, run: () => ({}) });
    const r1 = await runCli(app, ["--completions", "fish"]);
    expect(r1.exitCode).toBe(2);
    expect(r1.stderr).toContain('unknown option "--completions"');
    const r2 = await runCli(app, ["__complete", ""]);
    expect(r2.exitCode).toBe(2);
    expect(r2.stderr).toContain('unexpected argument "__complete"');
  });
});

describe("custom help", () => {
  test("a help string replaces generated help", async () => {
    const app = cli.create("x", { help: "MY HELP", run: () => {} });
    const r = await runCli(app, ["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("MY HELP\n");
  });
  test("a help function wraps generated help", async () => {
    const app = cli.create("x", {
      description: "does x",
      help: (generated) => `intro\n\n${generated}trailer\n`,
      run: () => {},
    });
    const r = await runCli(app, ["--help"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.stdout).toStartWith("intro\n");
    expect(r.stdout).toContain("Usage: x");
    expect(r.stdout).toEndWith("trailer\n");
  });
  test("child commands can define their own help", async () => {
    const app = cli.create("x", { help: "ROOT HELP" });
    app.command("sub", { help: "SUB HELP", run: () => {} });
    const root = await runCli(app, ["--help"]);
    expect(root.stdout).toBe("ROOT HELP\n");
    const sub = await runCli(app, ["sub", "--help"]);
    expect(sub.stdout).toBe("SUB HELP\n");
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
  test("hasStdin reflects piped stdin and stays hermetic in tests", async () => {
    const app = cli.create("x", { run: ({ hasStdin }) => ({ hasStdin }) });
    const piped = await runJson(app, [], { stdin: "hello" });
    const interactive = await runJson(app, []);
    expect(piped.json).toEqual({ hasStdin: true });
    expect(interactive.json).toEqual({ hasStdin: false });
  });
  test("isTTY reflects the terminal; isJSON reflects --json", async () => {
    const app = cli.create("x", { run: ({ isTTY, isJSON }) => ({ isTTY, isJSON }) });
    const nonTty = await runJson(app, []);
    const tty = await runJson(app, [], { isTTY: true });
    expect(nonTty.json).toEqual({ isTTY: false, isJSON: true });
    expect(tty.json).toEqual({ isTTY: true, isJSON: true });
  });
  test("handler console color codes are stripped when color is disabled", async () => {
    const app = cli.create("x", { run: () => console.log("\u001B[32mok\u001B[0m") });
    const plain = await runCli(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    const colored = await runCli(app, [], { isTTY: true });
    expect(plain.stdout).toBe("ok\n");
    expect(colored.stdout).toBe("\u001B[32mok\u001B[0m\n");
  });
  test("stripping removes only complete SGR sequences", async () => {
    const ESC = "\u001B";
    const BEL = "\u0007";
    const app = cli.create("x", {
      run: () => {
        console.log(`${ESC}[38;5;196mred${ESC}[m and ${ESC}[38:2:255:0:0mcolon${ESC}[0m`);
        console.log(`cursor ${ESC}[1A up, erase ${ESC}[2K line`);
        console.log(`link ${ESC}]8;;https://example.com${BEL}text${ESC}]8;;${BEL}`);
        console.log("literal [32m brackets", { n: 1 });
        console.log(`partial ${ESC}[32 stays`);
        console.error(`${ESC}[31mfail${ESC}[0m`);
      },
    });
    const r = await runCli(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(r.stdout).toContain("red and colon\n");
    expect(r.stdout).toContain(`cursor ${ESC}[1A up, erase ${ESC}[2K line\n`);
    expect(r.stdout).toContain(`link ${ESC}]8;;https://example.com${BEL}text${ESC}]8;;${BEL}\n`);
    expect(r.stdout).toContain("literal [32m brackets { n: 1 }\n");
    expect(r.stdout).toContain(`partial ${ESC}[32 stays\n`);
    expect(r.stderr).toBe("fail\n");
  });
  test("no-color decision propagates to process.env.NO_COLOR only for real-env runs", async () => {
    const savedNoColor = process.env.NO_COLOR;
    const savedForceColor = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    try {
      let seenDuringRun: string | undefined = "unset";
      const app = cli.create("x", {
        run: () => {
          seenDuringRun = process.env.NO_COLOR;
        },
      });
      const serveOpts = { stdout: () => {}, stderr: () => {}, exit: () => {} };
      // real process env (no env injected), non-TTY -> set during the run, restored after
      await app.serve([], { ...serveOpts, isTTY: false });
      expect<string | undefined>(seenDuringRun).toBe("1");
      expect(process.env.NO_COLOR).toBeUndefined();
      // color on -> untouched during the run
      seenDuringRun = "unset";
      await app.serve(["--color"], { ...serveOpts, isTTY: false });
      expect<string | undefined>(seenDuringRun).toBeUndefined();
      // injected env (testkit/embedders) -> real process env is never mutated
      await runCli(app, [], { isTTY: false });
      expect(process.env.NO_COLOR).toBeUndefined();
    } finally {
      if (savedNoColor === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = savedNoColor;
      if (savedForceColor === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = savedForceColor;
    }
  });
  test("shouldUseColor reflects the resolved color decision", async () => {
    const app = cli.create("x", { run: ({ shouldUseColor }) => ({ shouldUseColor }) });
    const ttyDefault = await runJson(app, [], { isTTY: true });
    const noColorFlag = await runJson(app, ["--no-color"], { isTTY: true });
    const noColorEnv = await runJson(app, [], { isTTY: true, env: { NO_COLOR: "1" } });
    const forcedNonTty = await runJson(app, [], { isTTY: false, env: { FORCE_COLOR: "1" } });
    expect(ttyDefault.json).toEqual({ shouldUseColor: true });
    expect(noColorFlag.json).toEqual({ shouldUseColor: false });
    expect(noColorEnv.json).toEqual({ shouldUseColor: false });
    expect(forcedNonTty.json).toEqual({ shouldUseColor: true });
  });
});

describe("serve error boundary", () => {
  test("configuration errors reject serve(); handler errors are caught", async () => {
    const bad = cli.create("x", {});
    bad.command("list", { run: () => {} });
    bad.command("other", { alias: "list", run: () => {} });
    await awaitRejection(
      expect(runCli(bad, [])).rejects.toThrow(
        'alias "list" for command "other" conflicts with command "list"',
      ),
    );

    const throwing = cli.create("x", {
      run: () => {
        throw new Error("boom");
      },
    });
    const r = await runCli(throwing, []);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe("error: boom\n");
  });
  test("object-level refinements on options/env are rejected at startup; args refinements run", async () => {
    const refinedOptions = cli.create("x", {
      options: z.object({ a: z.string().optional() }).refine(() => true),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(refinedOptions, [])).rejects.toThrow(
        'object-level refinements on options of "x" are not supported',
      ),
    );
    const refinedEnv = cli.create("x", {
      env: z.object({ A: z.string().optional() }).refine(() => true),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(refinedEnv, [])).rejects.toThrow('object-level refinements on env of "x"'),
    );
    const refinedArgs = cli.create("x", {
      args: z.object({ when: z.string() }).refine((a) => a.when !== "banana", "no bananas"),
      run: ({ args }) => args,
    });
    const good = await runJson(refinedArgs, ["apple"]);
    expect(good.json).toEqual({ when: "apple" });
    const bad = await runJson(refinedArgs, ["banana"]);
    expect(bad.exitCode).toBe(2);
    expect(expectCommandErrorResult(bad.json).error.message).toContain("no bananas");
  });
  test("unparseable input types are rejected at startup", async () => {
    const plainNumber = cli.create("x", {
      options: z.object({ minStatus: z.number() }),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(plainNumber, [])).rejects.toThrow(
        'option "minStatus" of "x" is z.number() but CLI values arrive as strings; use z.coerce.number()',
      ),
    );
    const variadicNumbers = cli.create("x", {
      args: z.object({ ports: z.array(z.number()) }),
      run: () => {},
    });
    await awaitRejection(
      expect(runCli(variadicNumbers, [])).rejects.toThrow('argument "ports" of "x" is z.number()'),
    );
    const satisfiable = cli.create("x", {
      options: z.object({
        port: z.coerce.number().default(3000),
        when: z.coerce.date().optional(),
        fallback: z.number().catch(1),
        mixed: z.union([z.number(), z.string()]).optional(),
      }),
      run: ({ options }) => options,
    });
    const r = await runJson(satisfiable, ["--port", "8080"]);
    expect(r.exitCode).toBe(0);
    expect(r.json).toMatchObject({ port: 8080, fallback: 1 });
  });
  test("isGunsmithError duck-check requires the error-family shape, not just the name", () => {
    expect(isGunsmithError(new UsageError("x"))).toBe(true);
    expect(isGunsmithError({ name: "GunsmithError", code: "VALIDATION", message: "m" })).toBe(true);
    expect(isGunsmithError({ name: "UsageError", code: "USAGE", message: "m" })).toBe(true);
    expect(isGunsmithError({ name: "UsageError", message: "foreign class, no code" })).toBe(false);
  });
});

describe("json output contract", () => {
  test("success emits raw data on stdout; failure emits the envelope on stdout, not stderr", async () => {
    const app = cli.create("x", {
      options: z.object({ fail: z.boolean().default(false) }),
      run: ({ options }) => {
        if (options.fail) throw new Error("boom");
        return { value: 1 };
      },
    });
    const success = await runCli(app, ["--json"]);
    expect(success.stdout).toBe('{"value":1}\n');
    expect(success.stderr).toBe("");
    expect(success.exitCode).toBe(0);
    const failure = await runCli(app, ["--fail", "--json"]);
    expect(failure.stdout).toBe('{"ok":false,"error":{"code":"UNKNOWN","message":"boom"}}\n');
    expect(failure.stderr).toBe("");
    expect(failure.exitCode).toBe(1);
  });
});

describe("exit-code model", () => {
  test("serve resolves with the exit code and reports it to the exit callback once", async () => {
    const app = cli.create("x", {
      options: z.object({ fail: z.boolean().default(false) }),
      run: ({ options }) => {
        if (options.fail) throw new Error("boom");
      },
    });
    const codes: number[] = [];
    const opts = {
      stdout: () => {},
      stderr: () => {},
      env: {},
      isTTY: false,
      exit: (code: number) => void codes.push(code),
    };
    expect(await app.serve([], opts)).toBe(0);
    expect(await app.serve(["--fail"], opts)).toBe(1);
    expect(await app.serve(["--nope"], opts)).toBe(2);
    expect(await app.serve(["--help"], opts)).toBe(0);
    expect(await app.serve(["--version"], opts)).toBe(0);
    expect(codes).toEqual([0, 1, 2, 0, 0]);
  });
  test("default exit records nonzero codes and never clobbers a handler-set process.exitCode", async () => {
    const saved = process.exitCode;
    const io = { stdout: () => {}, stderr: () => {}, env: {}, isTTY: false };
    try {
      process.exitCode = undefined;
      const doctor = cli.create("x", {
        run: () => {
          process.exitCode = 3;
        },
      });
      expect(await doctor.serve([], io)).toBe(3);
      expect<number | string | undefined>(process.exitCode).toBe(3);

      process.exitCode = undefined;
      const failing = cli.create("x", {
        run: () => {
          throw new Error("boom");
        },
      });
      expect(await failing.serve([], io)).toBe(1);
      expect<number | string | undefined>(process.exitCode).toBe(1);
    } finally {
      process.exitCode = saved ?? 0;
    }
  });
  test("handler-set process.exitCode surfaces in the resolved code and testkit exitCode", async () => {
    const saved = process.exitCode;
    try {
      process.exitCode = undefined;
      const app = cli.create("x", {
        run: () => {
          process.exitCode = 1;
        },
      });
      const r = await runCli(app, []);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toBe("");
    } finally {
      process.exitCode = saved ?? 0;
    }
  });
});

describe("global flags control", () => {
  test("-v prints the version", async () => {
    const r = await runCli(createDemoCli(), ["-v"]);
    expect(r.stdout).toBe("1.2.3\n");
    expect(r.exitCode).toBe(0);
  });
  test("a user option alias v shadows the built-in -v", async () => {
    const app = cli.create("x", {
      version: "9.9.9",
      options: z.object({ verbose: z.boolean().default(false).meta({ alias: "v" }) }),
      run: ({ options }) => ({ verbose: options.verbose }),
    });
    const r = await runJson(app, ["-v"]);
    expect(r.json).toEqual({ verbose: true });
  });
  test("per-command features.json=false rejects --json for that subtree only", async () => {
    const app = cli.create("x", { run: () => ({ root: true }) });
    app.command("tui", { features: { json: false }, run: () => ({ tui: true }) });
    app.command("list", { run: () => ({ list: true }) });
    const disabled = await runCli(app, ["tui", "--json"]);
    expect(disabled.exitCode).toBe(2);
    expect(disabled.stderr).toContain('unknown option "--json"');
    const rootJson = await runJson(app, []);
    expect(rootJson.json).toEqual({ root: true });
    const sibling = await runJson(app, ["list"]);
    expect(sibling.json).toEqual({ list: true });
    const help = await runCli(app, ["tui", "--help"], { isTTY: true, env: { NO_COLOR: "1" } });
    expect(help.stdout).not.toContain("--json");
    const complete = await runCli(app, ["__complete", "tui", "-"]);
    expect(complete.stdout).toContain("--help");
    expect(complete.stdout).not.toContain("--json");
  });
});

describe("inheritOptions", () => {
  const createApp = () => {
    const app = cli.create("x", {
      options: z.object({ port: z.coerce.number().default(3000) }),
      env: z.object({ HOST: z.string().default("localhost") }),
    });
    app.command("isolated", {
      inheritOptions: false,
      options: z.object({ out: z.string().default("dist") }),
      run: ({ options, env }) => ({ options, env }),
    });
    app.command("inheriting", {
      run: ({ options }) => ({ options }),
    });
    return app;
  };
  test("a non-inheriting child rejects parent options as unknown", async () => {
    const r = await runCli(createApp(), ["isolated", "--port", "4000"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('unknown option "--port"');
  });
  test("env still inherits when options do not", async () => {
    const r = await runJson(createApp(), ["isolated"], { env: { HOST: "h" } });
    expect(r.json).toEqual({ options: { out: "dist" }, env: { HOST: "h" } });
  });
  test("siblings keep inheriting", async () => {
    const r = await runJson(createApp(), ["inheriting", "--port", "4000"]);
    expect(r.json).toEqual({ options: { port: 4000 } });
  });
  test("a non-inheriting child may reuse a parent option name", async () => {
    const app = cli.create("x", { options: z.object({ format: z.string().default("a") }) });
    app.command("own", {
      inheritOptions: false,
      options: z.object({ format: z.enum(["md", "html"]).default("md") }),
      run: ({ options }) => options,
    });
    const r = await runJson(app, ["own", "--format", "html"]);
    expect(r.json).toEqual({ format: "html" });
  });
  test("a grandchild inherits from the opt-out node down", async () => {
    const app = cli.create("x", { options: z.object({ root: z.boolean().default(false) }) });
    const mid = cli.command("mid", {
      inheritOptions: false,
      options: z.object({ midOpt: z.boolean().default(false) }),
    });
    mid.command("leaf", { run: ({ options }) => options });
    app.command(mid);
    const ok = await runJson(app, ["mid", "leaf", "--mid-opt"]);
    expect(ok.json).toEqual({ midOpt: true });
    const bad = await runCli(app, ["mid", "leaf", "--root"]);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain('unknown option "--root"');
  });
  test("help omits parent options for a non-inheriting child", async () => {
    const help = await runCli(createApp(), ["isolated", "--help"], {
      isTTY: true,
      env: { NO_COLOR: "1" },
    });
    expect(help.stdout).toContain("--out");
    expect(help.stdout).not.toContain("--port");
  });
});
