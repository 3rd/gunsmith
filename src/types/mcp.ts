import type { CommandResult } from "./result";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpRuntimeOptions {
  env?: Record<string, string | undefined>;
}

export interface McpToolResult<T = unknown> {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent: CommandResult<T> & Record<string, unknown>;
  isError?: boolean;
}
