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
  -h, --help  show help
  -v, --version  print version
  --json  emit JSON output
  --color / --no-color  force/disable color (--color / --no-color)
  --mcp  run as an MCP stdio server
  --llms  print a Markdown command manifest
  --schema  print input/output JSON Schemas for the command
  --completions <bash|fish|zsh>  print a shell completion script

$ gh status
clean (branch: main)

$ gh pr
Usage: gh pr <command>

Manage pull requests

Commands:
  list (ls)  List pull requests

Global options:
  -h, --help  show help
  -v, --version  print version
  --json  emit JSON output
  --color / --no-color  force/disable color (--color / --no-color)
  --mcp  run as an MCP stdio server
  --llms  print a Markdown command manifest
  --schema  print input/output JSON Schemas for the command
  --completions <bash|fish|zsh>  print a shell completion script

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
| Integrations | `--schema`, feature toggles, thrown errors, exit codes |
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
| `args` | Positional arguments, assigned by schema key order; a trailing `z.array(...)` collects the remaining positionals (zero or more) |
| `options` | Named `--flags`; booleans support `--flag` and `--no-flag`; `.meta({ alias: "x" })` adds a `-x` short alias |
| `env` | Environment variables read by exact key name |
| `outputSchema` | Describes successful structured data and MCP output schema |
| `validateOutput` | Validate returned data against `outputSchema`; defaults to `"development"` |
| `examples` | Help examples |
| `rest` | Declares the command reads raw tokens after `--`; adds `[-- <args...>]` to usage, with an optional description |
| `notes` | Free-form prose appended to generated help after the examples |
| `help` | Replace generated help: a string, or `(generatedHelp) => string` to wrap it |
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
| `inheritOptions` | `false` stops inheriting parent options for this command and its subtree; `env` always inherits |
| `features` | Per-command surface exposure: `{ mcp, llms, json }`; `false` removes this command and its subtree from that surface |

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
| `shouldUseColor` | resolved color decision (`--color`/`--no-color`, then `FORCE_COLOR`/`NO_COLOR`, then TTY) |
| `hasStdin` | stdin is piped — the standard CLI heuristic (stdin is not an interactive terminal), so file redirection also counts |
| `rest` | tokens after `--` |
| `readStdin()` | read piped stdin |

### Zod coercion

CLI values arrive as strings. Booleans are inferred from presence. Use `z.coerce.*` for other
non-string values. A plain `z.number()`, `z.bigint()`, or `z.date()` in `args`/`options`/`env`
can never parse an incoming string, so gunsmith rejects it at startup with a pointer to the
`z.coerce` form instead of failing every invocation at runtime.

```ts
options: z.object({
  port: z.coerce.number().default(3000),
  when: z.coerce.date().optional(),
})
```

### Option aliases

Give an option a single-letter alias with `.meta({ alias })`:

```ts
options: z.object({
  yes: z.boolean().default(false).meta({ alias: "y", description: "skip confirmation" }),
})
```

`-y` then parses exactly like `--yes` (including `-y=false` and spaced values for non-booleans),
and help renders `-y, --yes`. The built-in `--help` global has the `-h` alias; an option alias
with the same letter overrides it. Aliases must be a single letter and unique within a command.
Across levels, aliases shadow like options do: the nearest definition wins, so a subcommand's
alias overrides an inherited parent's for that subtree. Only declared aliases are treated as
flags — any other single-dash token stays a positional argument or option value, as before.

For descriptions, `.meta({ description })` and `.describe("...")` are equivalent — both feed
help, `--llms`, and schema output — and `.meta({ alias }).describe("...")` merges fine.

### Naming across surfaces

Schema keys are camelCase; flags are their kebab-case rendering. `autoStop: z.boolean()` parses
as `--auto-stop`, while JSON surfaces (`--schema`, `--json` output keys, MCP tool arguments)
always use the schema key `autoStop`.

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

Opt out per child with `inheritOptions: false` — the child and its subtree then declare only
their own options (in parsing, help, `--schema`, and the handler type), and parent option names
become free to reuse. `env` always inherits:

```ts
app.command("build", {
  inheritOptions: false,
  options: z.object({ out: z.string().default("dist") }),
  run: ({ options }) => build(options), // { out: string } — no parent options
});
```

Declare `env` on the command that reads it: env declared on an ancestor is validated for every
invocation in that subtree, so a malformed ambient variable fails commands that never use it.
Root-level env buys shared typing and `--llms` visibility at exactly that cost (env is not
rendered in `--help`).

## Output, color, exit codes

Normal mode is human output. Gunsmith does not print returned values unless structured output is
requested.

| Behavior | Rule |
| ---- | ---- |
| Structured output | `--json` |
| Color | `--color` / `--no-color`, then `FORCE_COLOR` / `NO_COLOR`, then TTY |
| Success | exit `0` |
| Usage or validation error | exit `2` |
| Handler failure | exit `1` |
| Error format | `error: message` or structured JSON |

Gunsmith's own output follows the color rule automatically. When color is disabled, two more
things happen so `--no-color` and `NO_COLOR` work end to end: ANSI color codes are stripped from
your handler's `console` output (covering color libraries that decided support once at import
time), and — when serving the real process environment — `NO_COLOR=1` is set in `process.env`
for the duration of the invocation (never overriding a value you set, and restored afterward),
so Node's own formatting and subprocesses spawned by the handler follow the same decision. Two cases are not covered: output written directly to
`process.stdout`/`process.stderr` is not intercepted, and nothing can force color back onto a
library that already decided against it. For those, gate on the context's `shouldUseColor`,
which carries the same resolved decision:

```ts
run: ({ shouldUseColor }) => {
  const paint = (s: string) => (shouldUseColor ? `\u001B[32m${s}\u001B[0m` : s);
  process.stdout.write(`${paint("done")}\n`);
},
```

### Exit codes and process lifetime

`serve()` resolves with the exit code (`0` success, `1` handler failure, `2` usage/validation)
and, by default, never calls `process.exit`. Nonzero codes are recorded via `process.exitCode`
so the process exits with the right status when the event loop drains — and a zero result never
overwrites a `process.exitCode` your handler set. In practice:

- long-lived handlers (REPLs, servers, pending prompts) keep running after `run()` resolves
- a "completed, but failed" command (linters, doctors) exits nonzero with plain Node idiom —
  set `process.exitCode = 1` in the handler; no extra error line is printed, and the resolved
  value (and testkit `exitCode`) reflects it
- embedders and tests get the code as the resolved value: `const code = await app.serve(argv)`
- to force immediate termination (e.g. lingering sockets you keep open on purpose), opt back
  in: `app.serve(argv, { exit: (c) => process.exit(c) })`

```ts
app.command("doctor", {
  run: async () => {
    const problems = await runChecks();
    for (const problem of problems) console.log(`not ok: ${problem}`);
    if (problems.length > 0) process.exitCode = 1;
  },
});
```

### JSON output contract

`--json` makes stdout a single JSON line — on success **and** on failure — so scripts parse
stdout and never need stderr redirection:

| Surface | Success | Failure |
| ---- | ---- | ---- |
| `--json` stdout | the handler's returned data, raw (`null` if nothing returned) | `{"ok":false,"error":{"code":"...","message":"..."}}` |
| MCP `structuredContent` | `{"ok":true,"data":...}` | `{"ok":false,"error":{...}}` |
| `runJson().json` | the returned data | the error envelope |

```console
$ gh pr ls acme/widgets --json | jq '.prs[0].title'
"Fix CI in acme/widgets"

$ gh pr ls --json
{"ok":false,"error":{"code":"VALIDATION","message":"invalid argument \"repo\": Invalid input: expected string, received undefined"}}
```

Rules scripts can rely on:

- exactly one JSON line on stdout; handler `console.*` output is suppressed in structured mode
- success output is your returned data with no wrapper — it composes directly with `jq` and pipes
- failure output is always the `{"ok":false,"error":{code,message}}` envelope, on **stdout**;
  codes are `VALIDATION`, `USAGE`, `COMMAND_NOT_FOUND`, `UNKNOWN` (exit codes `2`/`2`/`2`/`1`
  also reflect the outcome, but parsing stdout is sufficient)
- the success/failure asymmetry is intentional: raw data keeps piping friction-free while
  failures stay machine-distinguishable

MCP always uses the full `{ok, ...}` envelope on both sides; the advertised tool output schema
encodes exactly that union.

### Signaling errors from handlers

Throw `UsageError` for user mistakes — cross-flag rules, missing files, anything schema
validation can't express. It renders as `error: message` and exits `2`, exactly like gunsmith's
own validation errors. Any other thrown error is treated as unexpected: same rendering, exit
`1`, and `DEBUG=1` prints its stack to stderr.

```ts
import { UsageError } from "gunsmith";

run: ({ options }) => {
  if (options.duration && !options.record) {
    throw new UsageError("--duration requires --record");
  }
},
```

Error codes (`USAGE`, `VALIDATION`, `UNKNOWN`, ...) never appear in human output — they live in
the [JSON output contract](#json-output-contract) envelope and MCP results.

### What serve() catches

The boundary is intentional: user mistakes are runtime UX, developer mistakes crash loudly at
startup. Caught, rendered, and turned into exit codes (they never reach your code):

- anything thrown from `run()` — rendered as `error: message` (or the JSON error envelope);
  exit `1` for plain errors, exit `2` for a thrown `UsageError`
- schema validation failures and argv problems (unknown options or commands, missing values,
  excess positionals) — exit `2`

Propagated — these reject the `serve()` promise because they are configuration bugs, not user
input:

- command-tree issues found at startup: invalid command names, alias conflicts, invalid option
  aliases, unsupported object-level refinements on options/env, unparseable value types like a
  plain `z.number()` (a duplicate direct command name fails even earlier — `.command()` throws
  synchronously at registration)
- MCP startup failures: `--mcp` without `@modelcontextprotocol/sdk` installed, duplicate tool
  names

So a bin entry needs no defensive `.catch`:

```ts
await app.serve();
// a rejection here means a configuration bug (conflicting alias, missing MCP SDK):
// let it crash with the stack, or map it explicitly if you prefer
```

Set `DEBUG=1` to print stack traces for unexpected (non-`GunsmithError`) handler errors to
stderr.

| Flag | Effect |
| ---- | ------ |
| `-h`, `--help` | Show help (hidden commands omitted) |
| `-v`, `--version` | Print the CLI version |
| `--json` | Print the structured result as JSON |
| `--color` / `--no-color` | Force/disable ANSI color |
| `--mcp` | Run as an MCP stdio server |
| `--llms` | Print a Markdown command manifest |
| `--schema` | Print `{ input, output }` JSON Schemas for the resolved command |
| `--completions <bash\|fish\|zsh>` | Print a completion script |

If a command declares an option that collides with a built-in name, the **command's option
wins** and that built-in is disabled for it.

Disable optional built-in flags independently:

```ts
cli.create("internal", {
  features: { mcp: false, schema: false, llms: false, json: false, color: false, completions: false },
});
```

`json: false` removes `--json` — useful for interactive tools whose human output
would be suppressed in structured mode. The emitted shapes are documented in
[JSON output contract](#json-output-contract). `color: false` removes `--color`/`--no-color`. Disabled
flags are rejected as unknown options and omitted from help. The programmatic
`serve(argv, { format })` option and `NO_COLOR`/`FORCE_COLOR` env handling keep working.

Root `mcp: false` / `llms: false` also exclude the whole command tree from those surfaces when
you use the programmatic `gunsmith/mcp` helpers (`listTools`, `buildServer`, `invokeTool`) —
not just the `--mcp`/`--llms` flags. The same keys on a child command exclude only that
command's subtree. `json: false` on a child command removes `--json` for that subtree the same
way; MCP tool invocation is unaffected (tools always return structured results). `completions: false` removes `--completions` and the reserved `__complete`
hook.

## Shell completions

```bash
source <(mycli --completions bash)
mycli --completions zsh > ~/.zsh/completions/_mycli
mycli --completions fish > ~/.config/fish/completions/mycli.fish
```

The scripts delegate to a hidden `mycli __complete <words...>` hook at completion time, so
candidates always match the running binary: subcommands and their aliases (hidden commands
omitted), long flags and short aliases, enum option values, and `--completions`
presets. Candidates are exact — there is no filesystem fallback. `__complete` is a reserved
command name, and it is intercepted as a first argument while `features.completions` is enabled.

## MCP

`--mcp` starts a stdio MCP server. Every non-hidden runnable command becomes a tool. Nested command
names are joined with `_`. Input schemas come from args and options. Output schemas are generated
from `outputSchema`.

The MCP SDK is lazy-loaded through `gunsmith/mcp`; install `@modelcontextprotocol/sdk` if you use
`--mcp` or import that subpath.

## Compiling with Bun

`bun build --compile` works with no extra flags: the lazy `--mcp` import is invisible to
bundlers, so `@modelcontextprotocol/sdk` is never pulled into your bundle or binary —
`--minify` included. `bun run check:compile` pins this.

The same opacity means a single-file executable cannot load the MCP server lazily. To ship a
binary that serves MCP, give the bundler a real edge by importing it eagerly:

```ts
import { serveMcp } from "gunsmith/mcp";

if (process.argv.includes("--mcp")) await serveMcp(app);
else await app.serve();
```

Everywhere else (`bun run`, `node`, installed packages) `--mcp` keeps working lazily, with the
SDK resolved from `node_modules` at runtime.

## Testing

`gunsmith/testing` runs commands in-process.

```ts
import { runCli, runJson } from "gunsmith/testing";

const r = await runCli(app, ["Ada", "--loud"]);
expect(r.stdout).toBe("HELLO ADA\n");
expect(r.exitCode).toBe(0);

const j = await runJson(app, ["Ada", "--loud"]);
expect(j.json).toEqual({ message: "HELLO ADA" });

await runCli(app, ["Ada"], { isTTY: true, env: { NO_COLOR: "1" }, stdin: "piped input text" });
```

`runJson().json` follows the [JSON output contract](#json-output-contract): the returned data on
success, the `{"ok":false,"error":{...}}` envelope on failure.

### Environment semantics

Testkit runs are hermetic by default:

- `env` **replaces** the process environment — omitting it means an **empty** environment, not
  `process.env`. Ambient variables (`GITHUB_TOKEN`, `NO_COLOR`, ...) never leak into a test
  unless you pass them.
- `isTTY` defaults to `false` (CI-shaped); set `true` to exercise TTY-dependent behavior.
- `stdin: "..."` means "stdin is piped with this content" — it also makes `ctx.hasStdin` `true`.
  Omitting it means no piped stdin.

```ts
// hermetic by default: only what you pass exists
const r = await runCli(app, ["prs"], { env: { GITHUB_REPO: "a/b", GITHUB_TOKEN: "t" } });

// deliberately inherit the real environment
const r2 = await runCli(app, ["prs"], { env: { ...process.env, GITHUB_REPO: "a/b" } });
```
