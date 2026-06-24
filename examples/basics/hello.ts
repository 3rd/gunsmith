#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

cli
  .create("hello", {
    description: "Smallest useful app",
    args: z.object({ name: z.string().describe("Who to greet") }),
    run: ({ args }) => {
      const message = `hello ${args.name}`;
      console.log(message);
      return { message };
    },
  })
  .serve();
