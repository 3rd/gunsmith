#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("reports", {
  description: "Schema discovery example",
});

app.command("report", {
  description: "Create a report",
  args: z.object({ name: z.string().describe("Report name") }),
  options: z.object({
    format: z.enum(["html", "json"]).default("html"),
    limit: z.coerce.number().default(10),
  }),
  outputSchema: z.object({
    name: z.string(),
    format: z.enum(["html", "json"]),
    rows: z.number(),
  }),
  run: ({ args, options }) => {
    const result = { name: args.name, format: options.format, rows: options.limit };
    console.log(`created ${result.name}.${result.format}`);
    return result;
  },
});

app.serve();
