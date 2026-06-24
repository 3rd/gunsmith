#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

cli
  .create("status", {
    description: "Returned data with an output schema",
    outputSchema: z.object({
      clean: z.boolean(),
      branch: z.string(),
    }),
    validateOutput: true,
    run: () => {
      const result = { clean: true, branch: "main" };
      console.log(`clean on ${result.branch}`);
      return result;
    },
  })
  .serve();
