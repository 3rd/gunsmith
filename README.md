# Gunsmith

Tiny CLI framework for Node and Bun.

```bash
pnpm add gunsmith zod
# or
bun add gunsmith zod
```

Requires Node.js ≥ 22 or Bun, and `zod@^4`.

## Quickstart

Sample code:

```ts
import cli from "gunsmith";
import { z } from "zod";

// create app
const app = cli.create("gh", {
  version: "1.0.0",
  description: "Tiny GitHub-style CLI",
});

// create and add a command directly
app.command("status", {
  description: "Show repository status",
  run: () => {
    const result = { clean: true, branch: "main" };
    console.log(`clean (branch: ${result.branch})`);
  },
});

// create a command and then add it
// if it has no run() handler it will just print the help for its subcommands
const pr = cli.command("pr", {
  description: "Manage pull requests",
});

// create and add a subcommand
pr.command("list", {
  alias: "ls", // alternate command name
  description: "List pull requests", // help & MCP tool description
  args: z.object({
    repo: z.string().describe("owner/name"), // positional args
  }),
  options: z.object({
    state: z.enum(["open", "closed", "all"]).default("open").describe("Filter by state"), // --state
  }),
  env: z.object({
    GITHUB_TOKEN: z.string().optional().describe("GitHub token"),
  }),
  outputSchema: z.object({
    prs: z.array(z.object({ number: z.number(), title: z.string() })),
    state: z.enum(["open", "closed", "all"]),
    authenticated: z.boolean(),
  }), // describes --json data and MCP output schema
  examples: [{ command: "gh pr list acme/widgets --state closed" }], // shown in --help
  hidden: false, // true hides from help and MCP
  run: ({ args, options, env }) => {
    const prs = [{ number: 1, title: `Fix CI in ${args.repo}` }];
    for (const pull of prs) console.log(`#${pull.number} ${pull.title}`);

    // returned value is used for --json and MCP tool result
    return { prs, state: options.state, authenticated: Boolean(env.GITHUB_TOKEN) };
  },
});
app.command(pr);

app.serve();
```

Sample output:

```console
$ gh
Usage: gh <command>

Tiny GitHub-style CLI

Commands:
  status  Show repository status
  pr  Manage pull requests

Global options:
  --help  show help
  --version  print version
  --json  emit JSON output
  --format <value>  output format: pretty | json
  --color / --no-color  force/disable color (--color / --no-color)
  --mcp  run as an MCP stdio server
  --llms  print a Markdown command manifest
  --schema  print input/output JSON Schemas for the command

$ gh status
clean (branch: main)

$ gh pr
Usage: gh pr <command>

Manage pull requests

Commands:
  list (ls)  List pull requests

Global options:
  --help  show help
  --version  print version
  --json  emit JSON output
  --format <value>  output format: pretty | json
  --color / --no-color  force/disable color (--color / --no-color)
  --mcp  run as an MCP stdio server
  --llms  print a Markdown command manifest
  --schema  print input/output JSON Schemas for the command

$ gh pr list acme/widgets --state closed
#1 Fix CI in acme/widgets

$ gh pr ls acme/widgets --state closed --json
{"prs":[{"number":1,"title":"Fix CI in acme/widgets"}],"state":"closed","authenticated":false}
```

## Examples

Examples live in [`examples/`](./examples/README.md) and are grouped by what you are trying to learn:

| Area | Examples |
| ---- | -------- |
| Basics | smallest app, options/coercion, returned data with `outputSchema` |
| Commands | direct commands, nested command trees, inherited options/env |
| Runtime IO | env schemas, stdin, raw tokens after `--` |
| Integrations | `--schema`, feature toggles, thrown errors |
| Testing | `runCli()` and `runJson()` |

```bash
bun run examples/basics/hello.ts Ada
bun run examples/commands/nested-tree.ts task list --state closed
bun run examples/io/rest.ts rest -- --raw -x
bun run examples/testing/testkit.ts
```

## Defining commands

Use `cli.create()` for the root app. Use `cli.command()` for commands you mount under an app or command.

Common definition fields:

| Field | Meaning |
| ---- | ---- |
| `description` | Help text; MCP tool description for runnable commands |
| `args` | Positional arguments, assigned by schema key order |
| `options` | Named `--flags`; booleans support `--flag` and `--no-flag` |
| `env` | Environment variables read by exact key name |
| `outputSchema` | Describes successful structured data and MCP output schema |
| `validateOutput` | Validate returned data against `outputSchema`; defaults to `"development"` |
| `examples` | Help examples |
| `run` | Command handler |
| `version` | Value printed by `--version` |

Root app fields:

| Field | Meaning |
| ---- | ---- |
| `features` | Enable or disable optional built-in flags; all enabled by default |

Child command fields:

| Field | Meaning |
| ---- | ---- |
| `alias` | Alternate command name |
| `hidden` | Hide from help and MCP |

`run()` owns normal output. Print to stdout, start a TUI, call APIs, or return nothing.

Return a value when `--json` or MCP should receive structured data. In structured mode, `console.*`
is suppressed. If `run()` returns a value, `--json` prints that value directly; if it returns
nothing, structured output is `null`.

The object passed to `run()` is the command context. Destructure only the fields you need:

```ts
run: ({ args }) => {
  console.log(`hello ${args.name}`);
  return { greeted: args.name };
}
```

Context fields:

| Field | Meaning |
| ---- | ---- |
| `name` | Resolved command name |
| `args` | Parsed positional args |
| `options` | Parsed options, including inherited parent options |
| `env` | Parsed env values, including inherited parent env |
| `isTTY` | stdout is an interactive terminal |
| `isJSON` | structured output was requested |
| `rest` | tokens after `--` |
| `readStdin()` | read piped stdin |

### Zod coercion

CLI values arrive as strings. Booleans are inferred from presence. Use `z.coerce.*` for other
non-string values.

```ts
options: z.object({
  port: z.coerce.number().default(3000),
  when: z.coerce.date().optional(),
})
```

### Output schemas

`outputSchema` describes returned data and is included in the MCP output schema. Runtime validation
is controlled by `validateOutput`, which defaults to `"development"`: invalid returned data fails
only when `NODE_ENV=development`. Use `true` to always validate, or `false` to always return
best-effort data.

```ts
app.command("status", {
  outputSchema: z.object({
    clean: z.boolean(),
    branch: z.string(),
  }),
  validateOutput: "development",
  run: () => ({ clean: true, branch: "main" }),
});
```

Invalid returned data exits with a `VALIDATION` error only when output validation is enabled.

### Subcommands

Add a command directly:

```ts
app.command("status", {
  alias: "st",
  run: () => console.log("clean"),
});
```

Or build it separately and mount it:

```ts
const pr = cli.command("pr", {
  description: "Manage pull requests",
  run: () => console.log("use `gh pr list` to list pull requests"),
});
pr.command("list", { alias: "ls", run: () => console.log("no open PRs") });
app.command(pr);
```

If a command has subcommands but no `run`, invoking it prints its help.

### Inheritance

Direct child definitions inherit parent `options` and `env` schemas in the handler type. Child
fields win on name conflicts.

```ts
const app = cli.create("app", {
  options: z.object({ verbose: z.boolean().default(false) }),
  env: z.object({ TOKEN: z.string().optional() }),
});
app.command("build", {
  options: z.object({ target: z.string() }),
  run: ({ options, env }) => {
    options.verbose;
    options.target;
    env.TOKEN;
  },
});
```

Separately built `cli.command()` trees are typed from their own schemas. Repeat shared `options` or
`env` on that tree when its handlers need typed access:

```ts
const pr = cli.command("pr", {
  env: z.object({ TOKEN: z.string().optional() }),
});
pr.command("list", {
  run: ({ env }) => {
    env.TOKEN;
  },
});
app.command(pr);
```

Inherited options appear in help and `--schema`. Inherited options and env appear in `--llms`; MCP
input schemas include options, while env is read from the server environment.

## Output, color, exit codes

Normal mode is human output. Gunsmith does not print returned values unless structured output is
requested.

| Behavior | Rule |
| ---- | ---- |
| Structured output | `--json` or `--format json` |
| Color | `--color` / `--no-color`, then `FORCE_COLOR` / `NO_COLOR`, then TTY |
| Success | exit `0` |
| Usage or validation error | exit `2` |
| Handler failure | exit `1` |
| Error format | `error (CODE): message` or structured JSON |

## Built-in flags

| Flag | Effect |
| ---- | ------ |
| `--help` | Show help (hidden commands omitted) |
| `--version` | Print the CLI version |
| `--json` / `--format <pretty\|json>` | `json` prints the structured data; `pretty` (default) is human |
| `--color` / `--no-color` | Force/disable ANSI color |
| `--mcp` | Run as an MCP stdio server |
| `--llms` | Print a Markdown command manifest |
| `--schema` | Print `{ input, output }` JSON Schemas for the resolved command |

If a command declares an option that collides with a built-in name, the **command's option
wins** and that built-in is disabled for it.

Disable optional built-in flags independently:

```ts
cli.create("internal", {
  features: { mcp: false, schema: false, llms: false },
});
```

## MCP

`--mcp` starts a stdio MCP server. Every non-hidden runnable command becomes a tool. Nested command
names are joined with `_`. Input schemas come from args and options. Output schemas are generated
from `outputSchema`.

The MCP SDK is lazy-loaded through `gunsmith/mcp`; install `@modelcontextprotocol/sdk` if you use
`--mcp` or import that subpath.

## Testing

`gunsmith/testing` runs commands in-process.

```ts
import { runCli, runJson } from "gunsmith/testing";

const r = await runCli(app, ["Ada", "--loud"]);
expect(r.stdout).toBe("HELLO ADA\n");
expect(r.exitCode).toBe(0);

const j = await runJson(app, ["Ada", "--loud"]);
expect(j.json).toEqual({ message: "HELLO ADA" });

await runCli(app, ["Ada"], { isTTY: true, env: { NO_COLOR: "1" }, stdin: "piped" });
```
