import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunsmith-compile-"));
try {
  const entry = path.join(tmp, "cli.ts");
  fs.writeFileSync(
    entry,
    `import cli from ${JSON.stringify(new URL("../src/index.ts", import.meta.url).pathname)};
cli.create("fixture", { version: "0.0.0", run: () => void console.log("compiled ok") }).serve();
`,
  );

  // the MCP SDK must not be followed through loadMcp's opaque import
  const bundle = path.join(tmp, "bundle.js");
  execFileSync("bun", ["build", "--minify", "--target=bun", entry, `--outfile=${bundle}`], {
    stdio: "pipe",
  });
  const bundled = fs.readFileSync(bundle, "utf8");
  assert.ok(!bundled.includes("modelcontextprotocol"), "bundle must not contain the MCP SDK");

  // single-file executable builds with --minify and runs
  const binary = path.join(tmp, "fixture-bin");
  execFileSync("bun", ["build", "--compile", "--minify", entry, `--outfile=${binary}`], {
    stdio: "pipe",
  });
  const out = execFileSync(binary, [], { encoding: "utf8" });
  assert.equal(out, "compiled ok\n");
  console.log("compile ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
