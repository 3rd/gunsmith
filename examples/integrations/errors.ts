#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("release", { description: "Thrown errors example" });

app.command("publish", {
  description: "Publish a release",
  options: z.object({ channel: z.enum(["stable", "next"]).default("stable") }),
  run: ({ options }) => {
    if (options.channel !== "stable") {
      throw new Error(`channel "${options.channel}" is not publishable`);
    }
    console.log("published stable");
    return { channel: options.channel, published: true };
  },
});

app.serve();
