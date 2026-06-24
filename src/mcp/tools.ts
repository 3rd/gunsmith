import type { Cli } from "../create";
import type { AnyCommandDefinition, CommandNode } from "../types/commands";
import type { McpRuntimeOptions, McpToolDefinition, McpToolResult } from "../types/mcp";
import type { CommandResult } from "../types/result";
import { collectCommandEntries, findCommandTreeIssue } from "../command/tree";
import { isPicocliError, PicocliError } from "../errors";
import { createErrorResult } from "../render/result";
import { invokeCommand } from "../runtime/invoke";
import {
  assertUniqueInputKeys,
  buildInputModel,
  getEnvInput,
  getInputJsonSchema,
  splitNamedInput,
} from "../schemas/input-model";
import { toJsonSchema } from "../schemas/object";

interface ResolvedMcpRuntimeOptions {
  env: Record<string, string | undefined>;
}

export interface ToolEntry {
  name: string;
  description: string;
  node: CommandNode;
  commandPath: string[];
  def: AnyCommandDefinition;
}

const createToolResult = <T>(result: CommandResult<T>): McpToolResult<T> => {
  const structuredContent = result as CommandResult<T> & Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: !structuredContent.ok,
  };
};

const createToolErrorResult = <T>(code: string, message: string): McpToolResult<T> =>
  createToolResult<T>(createErrorResult(code, message));

export const createUnknownToolResult = <T>(toolName: string): McpToolResult<T> =>
  createToolErrorResult("COMMAND_NOT_FOUND", `unknown tool: ${toolName}`);

export const getToolInputSchema = (entry: ToolEntry): Record<string, unknown> => {
  const model = buildInputModel(entry.def);
  assertUniqueInputKeys(model, ["args", "options"]);
  return getInputJsonSchema(model, ["args", "options"]);
};

export const getToolOutputSchema = (entry: ToolEntry): Record<string, unknown> | undefined => {
  if (!entry.def.outputSchema) return undefined;
  return {
    type: "object",
    anyOf: [
      {
        type: "object",
        properties: {
          ok: { const: true },
          data: toJsonSchema(entry.def.outputSchema),
        },
        required: ["ok", "data"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          ok: { const: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
            additionalProperties: false,
          },
        },
        required: ["ok", "error"],
        additionalProperties: false,
      },
    ],
  };
};

export const getToolEntries = (root: CommandNode): ToolEntry[] => {
  const treeIssue = findCommandTreeIssue(root);
  if (treeIssue) throw new Error(treeIssue);
  const tools: ToolEntry[] = [];
  const names = new Set<string>();
  for (const entry of collectCommandEntries(root)) {
    if (!entry.node.def.run) continue;
    const name = entry.commandPath.length > 0 ? entry.commandPath.join("_") : root.name;
    if (names.has(name)) throw new Error(`duplicate MCP tool name: ${name}`);
    names.add(name);
    tools.push({
      name,
      description: entry.node.def.description ?? "",
      node: entry.node,
      commandPath: entry.commandPath,
      def: entry.def,
    });
  }
  return tools;
};

export const listTools = (root: Cli): McpToolDefinition[] => {
  return getToolEntries(root).map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: getToolInputSchema(entry),
    ...(entry.def.outputSchema ? { outputSchema: getToolOutputSchema(entry) } : {}),
  }));
};

const invokeToolCommand = async <T>(
  root: CommandNode,
  entry: ToolEntry,
  rawArgs: Record<string, unknown>,
  opts: ResolvedMcpRuntimeOptions,
): Promise<CommandResult<T>> => {
  const def = entry.def;
  const model = buildInputModel(def);
  const namedInput = splitNamedInput(model, rawArgs);

  assertUniqueInputKeys(model, ["args", "options"]);
  if (namedInput.unknownKey) {
    throw new PicocliError("VALIDATION", `unknown tool argument "${namedInput.unknownKey}"`);
  }

  const result = await invokeCommand({
    def,
    input: model,
    name: [root.name, ...entry.commandPath].join(" "),
    inputs: {
      argsInput: namedInput.argsInput,
      optionsInput: namedInput.optionsInput,
      envInput: getEnvInput(model, opts.env),
    },
    isTTY: false,
    isJSON: true,
    rest: [],
    readStdin: async () => "",
    suppressConsole: true,
    nodeEnv: opts.env.NODE_ENV,
  });
  return result.result as CommandResult<T>;
};

export const invokeToolEntry = async <T>(
  root: CommandNode,
  entry: ToolEntry,
  rawArgs: Record<string, unknown>,
  opts: ResolvedMcpRuntimeOptions,
): Promise<McpToolResult<T>> => {
  try {
    return createToolResult(await invokeToolCommand<T>(root, entry, rawArgs, opts));
  } catch (error) {
    const message = isPicocliError(error) ? error.message : ((error as Error).message ?? String(error));
    const code = isPicocliError(error) ? error.code : "UNKNOWN";
    return createToolErrorResult(code, message);
  }
};

export const invokeTool = async <T = unknown>(
  root: Cli,
  toolName: string,
  args: Record<string, unknown> = {},
  opts: McpRuntimeOptions = {},
): Promise<McpToolResult<T>> => {
  const runtimeOptions = { env: opts.env ?? process.env };
  const entry = getToolEntries(root).find((tool) => tool.name === toolName);
  if (!entry) return createUnknownToolResult(toolName);
  return invokeToolEntry<T>(root, entry, args, runtimeOptions);
};
