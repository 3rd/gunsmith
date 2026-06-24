import type { CliFeatures } from "../types/commands";
import type { GlobalFlag } from "../types/flags";

export const GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { name: "help", bool: true, description: "show help" },
  { name: "version", bool: true, description: "print version" },
  { name: "json", bool: true, description: "emit JSON output" },
  { name: "format", bool: false, description: "output format: pretty | json" },
  { name: "color", bool: true, description: "force/disable color (--color / --no-color)" },
  { name: "mcp", bool: true, description: "run as an MCP stdio server" },
  { name: "llms", bool: true, description: "print a Markdown command manifest" },
  { name: "schema", bool: true, description: "print input/output JSON Schemas for the command" },
];

const FEATURE_GLOBAL_FLAGS = new Set<keyof CliFeatures>(["llms", "mcp", "schema"]);

const isFeatureGlobalFlag = (name: string): name is keyof CliFeatures => {
  return FEATURE_GLOBAL_FLAGS.has(name as keyof CliFeatures);
};

export const getActiveGlobalFlags = (
  optionKeys: Iterable<string>,
  features: Required<CliFeatures>,
): GlobalFlag[] => {
  const taken = new Set(optionKeys);
  return GLOBAL_FLAGS.filter((g) => !taken.has(g.name) && (!isFeatureGlobalFlag(g.name) || features[g.name]));
};
