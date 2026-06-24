import { z } from "zod";
import cli, { command } from "../index";

// cli.create() infers args / options / env onto the handler context
cli.create("greet", {
  args: z.object({ name: z.string(), count: z.coerce.number() }),
  options: z.object({ loud: z.boolean().default(false) }),
  env: z.object({ TOKEN: z.string() }),
  run: (c) => {
    const _name: string = c.args.name;
    const _count: number = c.args.count;
    const _loud: boolean = c.options.loud;
    const _token: string = c.env.TOKEN;
    // @ts-expect-error unknown arg field
    const _nope = c.args.nope;
    // @ts-expect-error wrong type
    const _bad: number = c.args.name;
    return [_name, _count, _loud, _token, _nope, _bad];
  },
});

command("named", {
  options: z.object({ loud: z.boolean().default(false) }),
  alias: "n",
  run: (c) => {
    const _loud: boolean = c.options.loud;
    return _loud;
  },
});

cli.create("app-only", {
  // @ts-expect-error aliases belong in cli.command
  alias: "a",
});

cli.create("feature-flags", {
  features: { mcp: false, schema: false, llms: false },
});

command("feature-flags-command", {
  // @ts-expect-error features belong in cli.create
  features: { mcp: false },
});

// outputSchema types returned structured data
cli.create("typed-output", {
  outputSchema: z.object({ clean: z.boolean() }),
  validateOutput: "development",
  run: () => ({ clean: false }),
});

cli.create("bad-output-return", {
  outputSchema: z.object({ clean: z.boolean() }),
  // @ts-expect-error outputSchema types returned data
  run: () => ({ clean: "yes" }),
});

cli.create("bad-output-empty", {
  outputSchema: z.object({ clean: z.boolean() }),
  // @ts-expect-error outputSchema requires returned data
  run: () => {},
});

cli.create("typed-output-validation", {
  outputSchema: z.object({ clean: z.boolean() }),
  validateOutput: true,
  run: () => ({ clean: true }),
});

cli.create("typed-output-validation-off", {
  outputSchema: z.object({ clean: z.boolean() }),
  validateOutput: false,
  run: () => ({ clean: true }),
});

cli.create("bad-output-validation", {
  outputSchema: z.object({ clean: z.boolean() }),
  // @ts-expect-error validateOutput accepts boolean or "development"
  validateOutput: "production",
  run: () => ({ clean: true }),
});

// .command() infers on subcommands
cli.create("app").command("sub", {
  options: z.object({ verbose: z.boolean().default(false) }),
  run: (c) => {
    const _v: boolean = c.options.verbose;
    // @ts-expect-error wrong type
    const _bad: number = c.options.verbose;
    return [_v, _bad];
  },
});

// no schemas -> empty-record context
cli.create("bare", {
  run: (c) => {
    // @ts-expect-error nothing on args
    const _anything = c.args.anything;
    return _anything;
  },
});

// a direct subcommand inherits the parent command's options/env types in its handler context
cli
  .create("svc", {
    options: z.object({ verbose: z.boolean().default(false) }),
    env: z.object({ TOKEN: z.string() }),
  })
  .command("build", {
    options: z.object({ target: z.string() }),
    run: (c) => {
      const _own: string = c.options.target; // own option
      const _inherited: boolean = c.options.verbose; // inherited from svc
      const _env: string = c.env.TOKEN; // inherited env
      // @ts-expect-error not an option on either parent or child
      const _nope = c.options.nope;
      return [_own, _inherited, _env, _nope];
    },
  });

// cli.command() builds mountable commands that may run and own subcommands
cli.create("workspace").command(
  cli
    .command("task", {
      options: z.object({ verbose: z.boolean().default(false) }),
      outputSchema: z.object({ ok: z.boolean() }),
      run: (c) => {
        const _verbose: boolean = c.options.verbose;
        return { ok: _verbose };
      },
    })
    .command("list", {
      options: z.object({ state: z.enum(["open", "closed"]).default("open") }),
      run: (c) => {
        const _verbose: boolean = c.options.verbose;
        const _state: "closed" | "open" = c.options.state;
        return [_verbose, _state];
      },
    }),
);

// child option types win on name conflicts with inherited parent options
cli
  .create("conflict", {
    options: z.object({ mode: z.string().default("root") }),
  })
  .command("child", {
    options: z.object({ mode: z.enum(["fast", "slow"]).default("fast") }),
    run: (c) => {
      const _mode: "fast" | "slow" = c.options.mode;
      // @ts-expect-error child wins, so parent string is narrowed away
      const _bad: "root" = c.options.mode;
      return [_mode, _bad];
    },
  });
