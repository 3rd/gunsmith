import type { CliFeatures } from "../types/commands";
import type { GlobalFlag } from "../types/flags";

export const GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { name: "help", bool: true, alias: "h", description: "show help" },
  { name: "version", bool: true, description: "print version" },
  { name: "json", bool: true, description: "emit JSON output" },
  { name: "format", bool: false, description: "output format: pretty | json" },
  { name: "color", bool: true, description: "force/disable color (--color / --no-color)" },
  { name: "mcp", bool: true, description: "run as an MCP stdio server" },
  { name: "llms", bool: true, description: "print a Markdown command manifest" },
  { name: "schema", bool: true, description: "print input/output JSON Schemas for the command" },
  { name: "completions", bool: false, description: "print a shell completion script: bash | zsh | fish" },
];

const GLOBAL_FLAG_FEATURES: Partial<Record<string, keyof CliFeatures>> = {
  color: "color",
  completions: "completions",
  format: "json",
  json: "json",
  llms: "llms",
  mcp: "mcp",
  schema: "schema",
};

export const getActiveGlobalFlags = (
  optionKeys: Iterable<string>,
  features: Required<CliFeatures>,
): GlobalFlag[] => {
  const taken = new Set(optionKeys);
  return GLOBAL_FLAGS.filter((flag) => {
    if (taken.has(flag.name)) return false;
    const feature = GLOBAL_FLAG_FEATURES[flag.name];
    return feature === undefined || features[feature];
  });
};
