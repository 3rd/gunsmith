import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { CommandErrorResult } from "../types/result";
import cli from "../index";
import { runCli } from "../testing/testkit";

const noColor = { isTTY: true, env: { NO_COLOR: "1" } };

const expectCommandErrorResult = (json: unknown): CommandErrorResult => {
  expect(json).toMatchObject({ ok: false });
  return json as CommandErrorResult;
};

const createDemoCli = () => {
  const a = cli.create("demo", { version: "2.0.0", description: "demo cli" });
  a.command("greet", {
    description: "Greet someone",
    args: z.object({ name: z.string().describe("who to greet"), extra: z.array(z.string()) }),
    options: z.object({ loud: z.boolean().default(false).describe("shout") }),
    outputSchema: z.object({ message: z.string().describe("greeting message") }),
    alias: "hi",
    examples: [{ command: "demo greet Ada --loud", description: "shout" }],
    run: () => ({ message: "" }),
  });
  a.command("secret", { hidden: true, run: () => {} });
  return a;
};

describe("--help rendering", () => {
  test("command usage includes variadic args, options, examples, and globals", async () => {
    const r = await runCli(createDemoCli(), ["greet", "--help"], noColor);
    expect(r.exitCode).toBe(0);
    const o = r.stdout;
    expect(o).toContain("Usage: demo greet [options] <name> [extra...]");
    expect(o).toContain("Greet someone");
    expect(o).toContain("name <string>  who to greet");
    expect(o).toContain("extra <array>");
    expect(o).toContain("--loud  shout");
    expect(o).toContain("# shout");
    expect(o).toContain("demo greet Ada --loud");
    // global-options block derives from GLOBALS (single source)
    expect(o).toContain("--color / --no-color");
  });

  test("parent command lists non-hidden subcommands only", async () => {
    const r = await runCli(createDemoCli(), ["--help"], noColor);
    expect(r.stdout).toContain("Usage: demo <command>");
    expect(r.stdout).toContain("Commands:");
    expect(r.stdout).toContain("greet");
    expect(r.stdout).not.toContain("secret");
  });

  test("required option shows (required)", async () => {
    const a = cli.create("x", {
      options: z.object({ token: z.string() }),
      run: () => {},
    });
    const r = await runCli(a, ["--help"], noColor);
    expect(r.stdout).toContain("--token <string> (required)");
  });

  test("global options omit names disabled by command option collisions", async () => {
    const a = cli.create("x", {
      options: z.object({ json: z.string().optional() }),
      run: () => {},
    });
    const r = await runCli(a, ["--help"], noColor);
    expect(r.stdout).toContain("--json <string>");
    expect(r.stdout.match(/--json/g) ?? []).toHaveLength(1);
  });

  test("parent command help shows command aliases", async () => {
    const r = await runCli(createDemoCli(), ["--help"], noColor);
    expect(r.stdout).toContain("greet (hi)");
  });

  test("option aliases render as -x, --long", async () => {
    const a = cli.create("x", {
      options: z.object({ yes: z.boolean().default(false).meta({ alias: "y", description: "confirm" }) }),
      run: () => {},
    });
    const r = await runCli(a, ["--help"], noColor);
    expect(r.stdout).toContain("-y, --yes  confirm");
  });

  test("the built-in help global renders its -h alias", async () => {
    const r = await runCli(createDemoCli(), ["--help"], noColor);
    expect(r.stdout).toContain("-h, --help  show help");
  });

  test("a shadowed built-in -h alias is only advertised on its effective owner", async () => {
    const a = cli.create("x", {
      options: z.object({
        host: z.string().default("localhost").meta({ alias: "h", description: "host to use" }),
      }),
      run: () => {},
    });
    const r = await runCli(a, ["--help"], noColor);
    expect(r.stdout).toContain("-h, --host");
    expect(r.stdout).not.toContain("-h, --help");
    expect(r.stdout).toContain("--help  show help");
  });
});

describe("--llms manifest", () => {
  test("features.llms=false omits a command from the manifest but not from help", async () => {
    const a = cli.create("app", { version: "1.0.0" });
    a.command("build", { description: "build it", run: () => {} });
    a.command("purge", { description: "danger", features: { llms: false }, run: () => {} });
    const manifest = await runCli(a, ["--llms"]);
    expect(manifest.stdout).toContain("## app build");
    expect(manifest.stdout).not.toContain("purge");
    const help = await runCli(a, ["--help"], noColor);
    expect(help.stdout).toContain("purge  danger");
  });

  test("lists non-hidden commands with typed fields", async () => {
    const r = await runCli(createDemoCli(), ["--llms"]);
    expect(r.stdout).toContain("# demo");
    expect(r.stdout).toContain("## demo greet");
    expect(r.stdout).toContain("- arg `name` (string, required): who to greet");
    expect(r.stdout).toContain("- arg `extra` (array, required)");
    expect(r.stdout).toContain("- option `loud` (boolean, optional): shout");
    expect(r.stdout).toContain("- output `message` (string, required): greeting message");
    expect(r.stdout).not.toContain("secret");
  });
});

describe("--schema", () => {
  test("returns input and output JSON Schemas without env", async () => {
    const a = cli.create("svc", {
      args: z.object({ path: z.string() }),
      options: z.object({ force: z.boolean().default(false) }),
      env: z.object({ TOKEN: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      run: () => ({ ok: true }),
    });
    const r = await runCli(a, ["--schema"]);
    expect(r.exitCode).toBe(0);
    const js = JSON.parse(r.stdout) as {
      input: { properties: Record<string, unknown> };
      output: { properties: Record<string, unknown> };
    };
    expect(Object.keys(js.input.properties).sort()).toEqual(["force", "path"]);
    expect(Object.keys(js.output.properties).sort()).toEqual(["ok"]);
  });

  test("rejects duplicate fields across args/options", async () => {
    const a = cli.create("svc", {
      args: z.object({ path: z.string() }),
      options: z.object({ path: z.string().default(".") }),
      run: () => {},
    });
    const r = await runCli(a, ["--schema", "--json"]);
    expect(r.exitCode).toBe(2);
    expect(expectCommandErrorResult(r.json).error).toMatchObject({
      code: "VALIDATION",
      message: "schema fields must be unique across merged inputs: path",
    });
  });

  test("coerced date degrades to date-time string, no throw", async () => {
    const a = cli.create("svc", {
      options: z.object({ when: z.coerce.date() }),
      run: () => {},
    });
    const r = await runCli(a, ["--schema"]);
    const js = JSON.parse(r.stdout) as {
      input: { properties: Record<string, { type?: string; format?: string }> };
    };
    expect(js.input.properties.when).toEqual({ type: "string", format: "date-time" });
  });
});
