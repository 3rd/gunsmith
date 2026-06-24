import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Cli } from "../create";
import type { McpRuntimeOptions } from "../types/mcp";
import {
  createUnknownToolResult,
  getToolEntries,
  getToolInputSchema,
  getToolOutputSchema,
  invokeToolEntry,
} from "./tools";

export const buildServer = (root: Cli, opts: McpRuntimeOptions = {}): Server => {
  const runtimeOptions = { env: opts.env ?? process.env };
  const tools = getToolEntries(root);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolDefinitions = tools.map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: getToolInputSchema(entry) as { type: "object" },
    ...(entry.def.outputSchema ? { outputSchema: getToolOutputSchema(entry) as { type: "object" } } : {}),
  }));
  const server = new Server(
    { name: root.name, version: root.def.version ?? "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const entry = byName.get(req.params.name);
    if (!entry) return createUnknownToolResult(req.params.name);
    return invokeToolEntry(
      root,
      entry,
      (req.params.arguments ?? {}) as Record<string, unknown>,
      runtimeOptions,
    );
  });

  return server;
};

export const serveMcp = async (root: Cli, opts: McpRuntimeOptions = {}) => {
  await buildServer(root, opts).connect(new StdioServerTransport());
};
