#!/usr/bin/env node
import cli from "../../src/index";

const app = cli.create("raw", { description: "Raw args after --" });

app.command("rest", {
  description: "Show rest tokens",
  run: ({ rest }) => {
    console.log(rest.join(" "));
    return { rest };
  },
});

app.serve();
