#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("account", {
  description: "Environment variable example",
  env: z.object({
    API_TOKEN: z.string().optional().describe("API token"),
  }),
});

app.command("whoami", {
  description: "Show auth state",
  run: ({ env }) => {
    const result = { authenticated: Boolean(env.API_TOKEN) };
    console.log(result.authenticated ? "authenticated" : "anonymous");
    return result;
  },
});

app.serve();
