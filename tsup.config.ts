import { defineConfig } from "tsup";

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
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  platform: "node",
  target: "node22",
  treeshake: true,
  splitting: false,
  sourcemap: false,
  shims: false,
  external: ["zod", "@modelcontextprotocol/sdk"],
});
