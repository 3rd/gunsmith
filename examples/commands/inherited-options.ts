#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("ship", {
  description: "Inherited options and env example",
  options: z.object({ verbose: z.boolean().default(false) }),
  env: z.object({ TOKEN: z.string().optional() }),
});

app.command("deploy", {
  description: "Deploy a target",
  options: z.object({ target: z.string().default("staging") }),
  run: ({ options, env }) => {
    const result = {
      target: options.target,
      verbose: options.verbose,
      authenticated: Boolean(env.TOKEN),
    };
    console.log(`deploying ${result.target}${result.verbose ? " with verbose logs" : ""}`);
    return result;
  },
});

app.serve();
