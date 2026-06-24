#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

cli
  .create("repeat", {
    description: "Options, defaults, and coercion",
    options: z.object({
      name: z.string().default("world").describe("Name to print"),
      count: z.coerce.number().default(1).describe("Repeat count"),
      excited: z.boolean().default(false).describe("Add excitement"),
    }),
    run: ({ options }) => {
      const line = options.excited ? `hello ${options.name}!` : `hello ${options.name}`;
      for (let index = 0; index < options.count; index++) console.log(line);
      return { line, count: options.count };
    },
  })
  .serve();
