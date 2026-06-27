import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp/index": "src/mcp/index.ts",
    "testing/testkit": "src/testing/testkit.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  outDir: "dist",
  platform: "node",
  target: "node22",
  treeshake: true,
  sourcemap: false,
  shims: false,
  fixedExtension: false,
  outputOptions: { exports: "named" },
  deps: { neverBundle: ["zod", "@modelcontextprotocol/sdk"] },
});
