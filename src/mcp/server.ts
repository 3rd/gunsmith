import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Cli } from "../create";
import type { McpRuntimeOptions, McpToolResult } from "../types/mcp";
import { interceptInterrupts } from "../runtime/interrupt";
import { createToolDefinition, createUnknownToolResult, getToolEntries, invokeToolEntry } from "./tools";

const createServer = (
  root: Cli,
  opts: McpRuntimeOptions,
  trackCall?: (call: Promise<McpToolResult>) => void,
) => {
  const env = opts.env ?? process.env;
  const tools = getToolEntries(root);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolDefinitions = tools.map(createToolDefinition);
  const server = new Server(
    { name: root.name, version: root.def.version ?? "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const entry = byName.get(req.params.name);
    if (!entry) return createUnknownToolResult(req.params.name);

    const progressToken = extra._meta?.progressToken;
    const call = invokeToolEntry(root, entry, (req.params.arguments ?? {}) as Record<string, unknown>, {
      env,
      signal: extra.signal,
      onProgress: (update) => {
        if (progressToken === undefined) return;

        extra
          .sendNotification({ method: "notifications/progress", params: { ...update, progressToken } })
          .catch((error: unknown) => server.onerror?.(new Error(`Failed to send progress: ${String(error)}`)));
      },
    });
    trackCall?.(call);

    return call;
  });

  return server;
};

export const buildServer = (root: Cli, opts: McpRuntimeOptions = {}): Server => createServer(root, opts);

export const serveMcp = async (root: Cli, opts: McpRuntimeOptions = {}) => {
  const inFlightCalls = new Set<Promise<McpToolResult>>();

  const trackCall = (call: Promise<McpToolResult>) => {
    const forgetCall = () => inFlightCalls.delete(call);
    inFlightCalls.add(call);
    call.then(forgetCall, forgetCall);
  };

  const server = createServer(root, opts, trackCall);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    const previous = transport.onclose;
    transport.onclose = () => {
      previous?.();
      resolve();
    };
  });

  const closeServer = () => {
    server.close();
  };

  const hasAbortableTool = getToolEntries(root).some((entry) => entry.def.interrupt === "abort");
  const restoreInterrupts = hasAbortableTool ? interceptInterrupts(closeServer) : undefined;

  // The stdio transport ignores end of input. Without closing the server here, a client that
  // closes stdin would leave in-flight calls running with signals that never abort.
  process.stdin.once("end", closeServer);

  try {
    await server.connect(transport);
    // connect() resolves at startup; block until the connection ends
    await closed;
    await Promise.allSettled(inFlightCalls);
  } finally {
    process.stdin.off("end", closeServer);
    restoreInterrupts?.();
  }
};
