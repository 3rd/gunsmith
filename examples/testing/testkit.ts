#!/usr/bin/env node
import assert from "node:assert/strict";
import { z } from "zod";
import cli from "../../src/index";
import { runCli, runJson } from "../../src/testing/testkit";

const app = cli.create("greet", {
  args: z.object({ name: z.string() }),
  run: ({ args }) => {
    const message = `hello ${args.name}`;
    console.log(message);
    return { message };
  },
});

const human = await runCli(app, ["Ada"]);
assert.equal(human.stdout, "hello Ada\n");
assert.equal(human.exitCode, 0);

const structured = await runJson<{ message: string }>(app, ["Ada"]);
assert.deepEqual(structured.json, { message: "hello Ada" });

console.log("testing example passed");
