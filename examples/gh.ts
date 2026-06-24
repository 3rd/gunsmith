#!/usr/bin/env node
import { z } from "zod";
import cli from "../src/index";

const app = cli.create("gh", { version: "1.0.0", description: "A tiny GitHub-style CLI" });

app.command("status", {
  description: "Show repo status",
  run: async () => {
    console.log("clean (branch: main)");
    return { clean: true, branch: "main" };
  },
});

const pr = cli.command("pr", { description: "Manage pull requests" });

pr.command("list", {
  description: "List pull requests",
  alias: "ls",
  options: z.object({ state: z.enum(["open", "closed", "all"]).default("open") }),
  run: ({ options }) => {
    const prs = [{ number: 1, title: "Fix bug" }];
    for (const p of prs) console.log(`#${p.number}  ${p.title}`);
    return { prs, state: options.state };
  },
});

pr.command("view", {
  description: "View a pull request",
  args: z.object({ number: z.coerce.number().describe("PR number") }),
  run: ({ args }) => {
    console.log(`PR #${args.number}: Fix bug (open)`);
    return { number: args.number, title: "Fix bug", state: "open" };
  },
});

app.command(pr);

app.serve();
