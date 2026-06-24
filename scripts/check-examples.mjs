import { spawnSync } from "node:child_process";

const examples = [
  ["examples/greet.ts", ["Ada", "--json"]],
  ["examples/gh.ts", ["status", "--json"]],
  ["examples/basics/hello.ts", ["Ada", "--json"]],
  ["examples/basics/options.ts", ["--name", "Ada", "--count", "2", "--excited", "--json"]],
  ["examples/basics/output-schema.ts", ["--json"]],
  ["examples/commands/direct-command.ts", ["status", "--json"]],
  ["examples/commands/nested-tree.ts", ["task", "list", "--state", "closed", "--json"]],
  ["examples/commands/inherited-options.ts", ["deploy", "--target", "prod", "--json"]],
  ["examples/io/env.ts", ["whoami", "--json"]],
  ["examples/io/stdin.ts", ["count", "--json"], "hello\nworld\n"],
  ["examples/io/rest.ts", ["rest", "--json", "--", "--raw", "-x"]],
  ["examples/integrations/schema.ts", ["report", "daily", "--schema"]],
  ["examples/integrations/features.ts", ["--help"]],
  ["examples/integrations/errors.ts", ["publish", "--json"]],
  ["examples/integrations/errors.ts", ["publish", "--channel", "next", "--json"], undefined, 1],
  ["examples/testing/testkit.ts", []],
];

for (const [file, args, input, expectedStatus = 0] of examples) {
  const command = ["run", file, ...args];
  console.log(`$ bun ${command.join(" ")}`);
  const result = spawnSync("bun", command, {
    input,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== expectedStatus) process.exit(result.status ?? 1);
}
