#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("workspace", {
  version: "1.0.0",
  description: "Direct command example",
});

app.command("status", {
  description: "Show workspace status",
  options: z.object({ short: z.boolean().default(false) }),
  run: ({ options }) => {
    const result = { clean: true, branch: "main", changed: 0 };
    console.log(options.short ? "clean" : `clean on ${result.branch}, ${result.changed} changed files`);
    return result;
  },
});

app.command("sync", {
  description: "Sync the workspace",
  run: () => {
    console.log("synced");
    return { synced: true };
  },
});

app.serve();
