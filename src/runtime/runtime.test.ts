import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { CommandErrorResult } from "../types/result";
import { PicocliError } from "../errors";
import cli from "../index";
import { runCli, runJson } from "../testing/testkit";

const noColor = { isTTY: true, env: { NO_COLOR: "1" } };

const expectCommandErrorResult = (json: unknown): CommandErrorResult => {
  expect(json).toMatchObject({ ok: false });
  return json as CommandErrorResult;
};

const createDemoCli = () => {
  const a = cli.create("demo", { version: "1.0.0" });
  const task = cli.command("task", {});
  task.command("list", {
    options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
    run: ({ options }) => ({ state: options.state }),
  });
  a.command(task);
  a.command("status", { run: () => ({ clean: true }) });
  return a;
};

const createOptionCli = (shape: z.ZodRawShape) =>
  cli.create("x", { options: z.object(shape), run: ({ options }) => options });

const expectRejectedMessage = async (promise: Promise<unknown>, message: string) => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain(message);
};

describe("inline subcommands", () => {
  test("a command can be defined and mounted directly", async () => {
    const app = cli.create("app", {
      options: z.object({ verbose: z.boolean().default(false) }),
      env: z.object({ TOKEN: z.string().default("none") }),
    });
    app.command("status", {
      alias: "st",
      options: z.object({ branch: z.string().default("main") }),
      run: ({ name, options, env }) => {
        return {
          name,
          branch: options.branch,
          verbose: options.verbose,
          token: env.TOKEN,
        };
      },
    });

    const canonical = await runJson(app, ["status", "--verbose", "--branch", "release"], {
      env: { TOKEN: "secret" },
    });
    const alias = await runJson(app, ["st"]);

    expect(canonical.json).toEqual({
      name: "app status",
      branch: "release",
      verbose: true,
      token: "secret",
    });
    expect(alias.json).toMatchObject({
      name: "app status",
      branch: "main",
    });
  });

  test("a command with subcommands can be built with cli.command and mounted directly", async () => {
    const app = cli.create("demo");
    app.command(
      cli
        .command("task", {
          options: z.object({ verbose: z.boolean().default(false) }),
        })
        .command("list", {
          alias: "ls",
          options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
          run: ({ name, options }) => ({ name, state: options.state, verbose: options.verbose }),
        }),
    );

    const result = await runJson(app, ["task", "ls", "--verbose", "--state", "closed"]);

    expect(result.json).toEqual({
      name: "demo task list",
      state: "closed",
      verbose: true,
    });
  });

  test("a mounted command can run directly and still own nested commands", async () => {
    const app = cli.create("demo");
    const task = cli.command("task", {
      options: z.object({ project: z.string().default("self") }),
      run: ({ options }) => ({ command: "task", project: options.project }),
    });
    task.command("list", {
      options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
      run: ({ options }) => ({ command: "task list", project: options.project, state: options.state }),
    });
    app.command(task);

    const parent = await runJson(app, ["task", "--project", "team"]);
    const child = await runJson(app, ["task", "list", "--project", "team", "--state", "closed"]);

    expect(parent.json).toEqual({
      command: "task",
      project: "team",
    });
    expect(child.json).toEqual({
      command: "task list",
      project: "team",
      state: "closed",
    });
  });
});

describe("global flags before subcommand (C2)", () => {
  test("--json before a subcommand still resolves it", async () => {
    const r = await runCli(createDemoCli(), ["--json", "status"]);
    expect(r.json).toEqual({ clean: true });
  });
  test("value global (--format) before a subcommand consumes its value and resolves", async () => {
    const r = await runCli(createDemoCli(), ["--format", "json", "task", "list"]);
    expect(r.json).toEqual({ state: "open" });
  });
  test("root value option that shadows a boolean global still consumes before a subcommand", async () => {
    const a = cli.create("app", {
      options: z.object({ json: z.string().default("dev") }),
    });
    a.command("build", { run: ({ options }) => options });
    const r = await runCli(a, ["--format", "json", "--json", "prod", "build"]);
    expect(r.json).toEqual({ json: "prod" });
  });
});

describe("app features", () => {
  test("optional built-in globals can be disabled independently", async () => {
    const noMcp = cli.create("app", {
      features: { mcp: false },
      run: () => ({ enabled: true }),
    });
    const noMcpHelp = await runCli(noMcp, ["--help"], noColor);
    expect(noMcpHelp.stdout).not.toContain("--mcp");
    expect(noMcpHelp.stdout).toContain("--schema");
    expect(noMcpHelp.stdout).toContain("--llms");

    const mcp = await runCli(noMcp, ["--mcp"], noColor);
    expect(mcp.exitCode).toBe(2);
    expect(mcp.stderr).toBe('error (VALIDATION): unknown option "--mcp"\n');

    const noSchemaOrLlms = cli.create("app", {
      features: { schema: false, llms: false },
      run: () => ({ enabled: true }),
    });
    const noSchemaOrLlmsHelp = await runCli(noSchemaOrLlms, ["--help"], noColor);
    expect(noSchemaOrLlmsHelp.stdout).toContain("--mcp");
    expect(noSchemaOrLlmsHelp.stdout).not.toContain("--schema");
    expect(noSchemaOrLlmsHelp.stdout).not.toContain("--llms");

    const schema = await runCli(noSchemaOrLlms, ["--schema"], noColor);
    expect(schema.exitCode).toBe(2);
    expect(schema.stderr).toBe('error (VALIDATION): unknown option "--schema"\n');

    const llms = await runCli(noSchemaOrLlms, ["--llms"], noColor);
    expect(llms.exitCode).toBe(2);
    expect(llms.stderr).toBe('error (VALIDATION): unknown option "--llms"\n');
  });
});

describe("command aliases", () => {
  test("a command resolves by alias but reports its canonical command name", async () => {
    const a = cli.create("app");
    a.command("build", { alias: "b", run: ({ name }) => ({ name }) });
    const r = await runJson(a, ["b"]);
    expect(r.json).toEqual({ name: "app build" });
  });

  test("a nested command resolves by alias", async () => {
    const a = cli.create("app");
    const task = cli.command("task");
    task.command("list", { alias: "ls", run: ({ name }) => ({ name }) });
    a.command(task);
    const r = await runJson(a, ["task", "ls"]);
    expect(r.json).toEqual({ name: "app task list" });
  });

  test("command alias arrays resolve", async () => {
    const a = cli.create("app");
    a.command("remove", { alias: ["rm", "del"], run: ({ name }) => ({ name }) });
    const rm = await runJson(a, ["rm"]);
    const del = await runJson(a, ["del"]);
    expect(rm.json).toEqual({ name: "app remove" });
    expect(del.json).toEqual({ name: "app remove" });
  });

  test("did-you-mean can suggest command aliases", async () => {
    const a = cli.create("app");
    a.command("list", { alias: "ls", run: () => {} });
    const r = await runJson(a, ["lss"]);
    expect(expectCommandErrorResult(r.json).error.message).toBe('unknown command "lss"; did you mean "ls"?');
  });

  test("aliases cannot collide with sibling command names", async () => {
    const a = cli.create("app");
    a.command("list", { alias: "ls", run: () => {} });
    a.command("ls", { run: () => {} });
    await expectRejectedMessage(runCli(a, []), 'command name "ls" for "ls" conflicts with command "list"');
  });

  test("aliases cannot collide with sibling aliases", async () => {
    const a = cli.create("app");
    a.command("list", { alias: "ls", run: () => {} });
    a.command("show", { alias: "ls", run: () => {} });
    await expectRejectedMessage(runCli(a, []), 'alias "ls" for command "show" conflicts with command "list"');
  });

  test("aliases must be command tokens", async () => {
    const a = cli.create("app");
    a.command("list", { alias: "--ls", run: () => {} });
    await expectRejectedMessage(runCli(a, []), 'invalid alias "--ls" for command "list"');
  });
});

describe("did-you-mean (C3)", () => {
  test("never echoes the exact input back", async () => {
    const r = await runJson(createDemoCli(), ["status "]);
    expect(expectCommandErrorResult(r.json).error).toEqual({
      code: "COMMAND_NOT_FOUND",
      message: 'unknown command "status "; did you mean "status"?',
    });
  });
  test("suggests a near match", async () => {
    const r = await runJson(createDemoCli(), ["statuss"]);
    expect(expectCommandErrorResult(r.json).error.message).toBe(
      'unknown command "statuss"; did you mean "status"?',
    );
  });
});

describe("missing option value (C4)", () => {
  test("a value option with no value -> VALIDATION exit 2", async () => {
    const r = await runJson(createOptionCli({ name: z.string().optional() }), ["--name"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.message).toBe('option "--name" requires a value');
  });
  test("--help short-circuits a missing global value", async () => {
    const r = await runCli(createDemoCli(), ["--format", "--help"], noColor);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("Usage:");
  });
});

describe("invalid --format (C5)", () => {
  test("unrecognized format value -> VALIDATION exit 2 with did-you-mean", async () => {
    const r = await runJson(createDemoCli(), ["status", "--format", "jon"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.message).toBe(
      'invalid --format "jon"; expected pretty or json; did you mean "json"?',
    );
  });
});

describe("structured is opt-in (M1)", () => {
  test("--json=false is not structured (no result)", async () => {
    const a = cli.create("x", { run: ({ isJSON }) => ({ isJSON }) });
    const human = await runCli(a, ["--json=false"]);
    const json = await runCli(a, ["--json"]);
    expect(human.json).toBeUndefined();
    expect(json.json).toEqual({ isJSON: true });
  });
});

describe("variadic positional args", () => {
  test("trailing array arg collects the rest", async () => {
    const a = cli.create("cp", {
      args: z.object({ srcs: z.array(z.string()) }),
      run: ({ args }) => args,
    });
    const result = await runJson(a, ["a", "b", "c"]);
    expect(result.json).toEqual({ srcs: ["a", "b", "c"] });
  });
});

describe("collision rule", () => {
  test("a command option named like a global wins", async () => {
    const a = cli.create("y", {
      options: z.object({ json: z.string().optional() }),
      run: (c) => console.log(c.options.json ?? "none"),
    });
    const r = await runCli(a, ["--json", "custom"]);
    expect(r.stdout).toBe("custom\n"); // --json was the command's option, not the structured flag
  });
});

describe("--format overrides", () => {
  test("--format json makes output structured", async () => {
    const r = await runCli(createOptionCli({ v: z.string().default("hi") }), ["--format", "json"]);
    expect(r.json).toEqual({ v: "hi" });
  });
  test("--format pretty stays human (no result)", async () => {
    const r = await runCli(createOptionCli({ v: z.string().default("hi") }), ["--format", "pretty"]);
    expect(r.json).toBeUndefined();
  });
});

describe("error rendering", () => {
  test("thrown PicocliError renders its code", async () => {
    const a = cli.create("e", {
      run: () => {
        throw new PicocliError("VALIDATION", "oops");
      },
    });
    const r = await runCli(a, [], noColor);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toBe("error (VALIDATION): oops\n");
    expect(r.stdout).toBe("");
  });
  test("color: validation error on a TTY is red", async () => {
    const a = cli.create("e", { args: z.object({ name: z.string() }), run: () => {} });
    const r = await runCli(a, [], { isTTY: true });
    expect(r.stderr).toContain("\u001b[31m");
  });
});

describe("--no-flag on a non-boolean option", () => {
  test("rejected as VALIDATION", async () => {
    const r = await runJson(createOptionCli({ port: z.coerce.number().optional() }), ["--no-port"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error.code).toBe("VALIDATION");
  });
});

describe("inherited command options", () => {
  const inheritApp = () => {
    const a = cli.create("app", {
      options: z.object({ verbose: z.boolean().default(false) }),
      env: z.object({ TOKEN: z.string().default("none") }),
    });
    a.command("build", {
      options: z.object({ target: z.string().default("x") }),
      run: ({ options, env }) => ({ ...options, token: env.TOKEN }),
    });
    const task = cli.command("task", { options: z.object({ project: z.string().default("self") }) });
    task.command("list", { run: ({ options }) => options });
    a.command(task);
    return a;
  };

  test("a subcommand sees the parent command's option at runtime", async () => {
    const r = await runJson(inheritApp(), ["build", "--verbose", "--target", "y"]);
    expect(r.json).toEqual({ verbose: true, target: "y", token: "none" });
  });
  test("inherited env schema applies", async () => {
    const r = await runJson(inheritApp(), ["build"], { env: { TOKEN: "secret" } });
    expect(r.json).toMatchObject({ token: "secret" });
  });
  test("inheritance is multi-level through a mounted sub-CLI", async () => {
    const r = await runJson(inheritApp(), ["task", "list", "--verbose"]);
    expect(r.json).toEqual({ verbose: true, project: "self" });
  });
  test("a parent command value option before a nested command does not stop command resolution", async () => {
    const r = await runJson(inheritApp(), ["task", "--project", "team", "list"]);
    expect(r.json).toEqual({
      verbose: false,
      project: "team",
    });
  });
  test("--help on a subcommand shows inherited options", async () => {
    const r = await runCli(inheritApp(), ["build", "--help"], noColor);
    expect(r.stdout).toContain("--verbose");
    expect(r.stdout).toContain("--target");
  });
  test("--schema includes inherited options but not env", async () => {
    const r = await runCli(inheritApp(), ["build", "--schema"]);
    const js = JSON.parse(r.stdout) as { input: { properties: Record<string, unknown> } };
    expect(Object.keys(js.input.properties).sort()).toEqual(["target", "verbose"]);
  });
});

describe("command tree strictness", () => {
  test("a bare parent command still rejects unknown flags", async () => {
    const a = cli.create("app");
    a.command("build", { run: () => {} });
    const r = await runJson(a, ["--typo"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error).toMatchObject({ code: "VALIDATION" });
  });
});

describe("testing helper", () => {
  test("runJson forces structured mode without changing argv", async () => {
    const a = cli.create("x", { run: ({ rest }) => ({ rest }) });
    const r = await runJson(a, ["--", "--raw"]);
    expect(r.json).toEqual({ rest: ["--raw"] });
  });
});
