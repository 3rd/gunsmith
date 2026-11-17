import type { McpToolAnnotations, ProgressUpdate } from "./commands";
import type { CommandResult } from "./result";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface McpRuntimeOptions {
  env?: Record<string, string | undefined>;
}

export interface McpInvokeOptions extends McpRuntimeOptions {
  /** Cancels the call: aborting it aborts the handler's `signal`, like an MCP client's cancellation. */
  signal?: AbortSignal;
  /** Receives each `reportProgress` update, like an MCP client that sent a progress token. */
  onProgress?: (update: ProgressUpdate) => void;
}

export interface McpToolResult<T = unknown> {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent: CommandResult<T> & Record<string, unknown>;
  isError?: boolean;
}
