#!/usr/bin/env node
import { z } from "zod";
import cli from "../src/index";

cli
  .create("greet", {
    description: "Greet someone",
    args: z.object({ name: z.string().describe("Who to greet") }),
    options: z.object({
      loud: z.boolean().default(false).describe("Shout the greeting"),
      times: z.coerce.number().default(1).describe("Repeat count"),
    }),
    examples: [{ command: "greet Ada --loud", description: "shout a greeting" }],
    run: ({ args, options }) => {
      const line = options.loud ? `hello ${args.name}`.toUpperCase() : `hello ${args.name}`;
      for (let i = 0; i < options.times; i++) console.log(line); // suppressed under --json / MCP
      return { message: line, times: options.times }; // the --json / MCP result
    },
  })
  .serve();
