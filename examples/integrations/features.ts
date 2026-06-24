#!/usr/bin/env node
import cli from "../../src/index";

cli
  .create("internal", {
    description: "Built-in feature toggles example",
    features: { mcp: false, schema: false, llms: false },
    run: () => {
      console.log("internal command");
      return { ok: true };
    },
  })
  .serve();
