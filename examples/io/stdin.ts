#!/usr/bin/env node
import cli from "../../src/index";

const app = cli.create("text", { description: "stdin example" });

app.command("count", {
  description: "Count bytes and lines from stdin",
  run: async ({ readStdin }) => {
    const input = await readStdin();
    const result = {
      bytes: Buffer.byteLength(input),
      lines: input.length === 0 ? 0 : input.split(/\r?\n/).filter(Boolean).length,
    };
    console.log(`${result.bytes} bytes, ${result.lines} lines`);
    return result;
  },
});

app.serve();
