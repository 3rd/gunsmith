#!/usr/bin/env node
import process from "node:process";
import cli from "../../src/index";

const app = cli.create("doctor", { description: "Exit-code example" });

app.command("check", {
  description: "Run environment checks; exit nonzero when any fail, without an error line",
  run: () => {
    const problems = ["PATH entry missing", "cache directory not writable"];
    for (const problem of problems) console.log(`not ok: ${problem}`);
    console.log(`${problems.length} problem(s) found`);
    // "completed, but failed": plain Node idiom — gunsmith never overwrites it on success
    if (problems.length > 0) process.exitCode = 1;
  },
});

app.serve();
