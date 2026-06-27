# Gunsmith examples

Run examples with Bun from the repository root:

```bash
bun run examples/greet.ts Ada --loud --json
```

The examples are grouped by what you are trying to learn. Start with basics, then move to command composition, runtime IO, integrations, and testing.

## Quick starts

| Example                  | Run                                                    | Shows                                           |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| [`greet.ts`](./greet.ts) | `bun run examples/greet.ts Ada --loud`                 | args, options, human output, returned JSON data |
| [`gh.ts`](./gh.ts)       | `bun run examples/gh.ts pr list --state closed --json` | direct commands, nested command tree, aliases   |

## Basics

| Example                                                | Run                                                                 | Shows                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| [`basics/hello.ts`](./basics/hello.ts)                 | `bun run examples/basics/hello.ts Ada`                              | smallest useful single-command app       |
| [`basics/options.ts`](./basics/options.ts)             | `bun run examples/basics/options.ts --name Ada --count 3 --excited` | defaults, booleans, coerced numbers      |
| [`basics/output-schema.ts`](./basics/output-schema.ts) | `bun run examples/basics/output-schema.ts --json`                   | `outputSchema`, returned structured data |

## Commands

| Example                                                            | Run                                                                                                 | Shows                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`commands/direct-command.ts`](./commands/direct-command.ts)       | `bun run examples/commands/direct-command.ts status --json`                                         | `app.command("name", ...)`                 |
| [`commands/nested-tree.ts`](./commands/nested-tree.ts)             | `bun run examples/commands/nested-tree.ts task list --state closed`                                 | `cli.command()` command groups and aliases |
| [`commands/inherited-options.ts`](./commands/inherited-options.ts) | `TOKEN=secret bun run examples/commands/inherited-options.ts deploy --verbose --target prod --json` | inherited direct-command options and env   |

## Runtime IO

| Example                        | Run                                                                 | Shows             |
| ------------------------------ | ------------------------------------------------------------------- | ----------------- |
| [`io/env.ts`](./io/env.ts)     | `API_TOKEN=secret bun run examples/io/env.ts whoami --json`         | env schemas       |
| [`io/stdin.ts`](./io/stdin.ts) | `printf 'hello stdin' \| bun run examples/io/stdin.ts count --json` | `readStdin()`     |
| [`io/rest.ts`](./io/rest.ts)   | `bun run examples/io/rest.ts rest -- --raw -x`                      | tokens after `--` |

## Integrations

| Example                                                  | Run                                                                     | Shows                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| [`integrations/schema.ts`](./integrations/schema.ts)     | `bun run examples/integrations/schema.ts report --schema`               | input/output schema discovery     |
| [`integrations/features.ts`](./integrations/features.ts) | `bun run examples/integrations/features.ts --help`                      | disabling optional built-in flags |
| [`integrations/errors.ts`](./integrations/errors.ts)     | `bun run examples/integrations/errors.ts publish --channel next --json` | plain thrown errors               |

## Testing

| Example                                      | Run                                   | Shows                      |
| -------------------------------------------- | ------------------------------------- | -------------------------- |
| [`testing/testkit.ts`](./testing/testkit.ts) | `bun run examples/testing/testkit.ts` | `runCli()` and `runJson()` |
