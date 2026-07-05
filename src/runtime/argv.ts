import type { Cli } from "../create";
import type { CliFeatures, CommandInvocation } from "../types/commands";
import type { ServeOptions } from "../types/execution";
import type { InputModel } from "../types/input";
import { resolveCommandPath } from "../command/resolve";
import {
  createCommandNodeView,
  findCommandTreeIssue,
  getCommandChain,
  getCommandChildren,
  getEffectiveCommandDefinition,
} from "../command/tree";
import { GunsmithError } from "../errors";
import { getActiveGlobalFlags } from "../flags/globals";
import { buildFlagModel, getFlagTokenRole } from "../flags/model";
import { tokenizeArgv } from "../flags/tokenizer";
import { getShouldUseAnsi, makePaint } from "../render/color";
import { buildInputModel } from "../schemas/input-model";

export const resolveInvocation = (root: Cli, argv: string[]): CommandInvocation => {
  const treeIssue = findCommandTreeIssue(root);
  if (treeIssue) throw new GunsmithError("VALIDATION", treeIssue);

  const { node, commandPath, remainingArgv } = resolveCommandPath(root, argv, (flagToken, path) => {
    const def = getEffectiveCommandDefinition(getCommandChain(root, [...path]));
    return getFlagTokenRole(def.options)(flagToken);
  });
  const chain = getCommandChain(root, commandPath);
  const def = getEffectiveCommandDefinition(chain);
  const input = buildInputModel(def);
  return {
    node,
    chain,
    helpNode: createCommandNodeView(node, def),
    commandPath,
    remainingArgv,
    commandName: [root.name, ...commandPath].join(" "),
    hasSubcommands: getCommandChildren(node).size > 0,
    def,
    input,
  };
};

export const parseGlobals = (params: {
  input: InputModel;
  remainingArgv: string[];
  opts: Pick<ServeOptions, "format">;
  env: Record<string, string | undefined>;
  isTTY: boolean;
  features: Required<CliFeatures>;
}) => {
  const { input, remainingArgv, opts, env, isTTY, features } = params;
  const optionKeys = input.optionKeys;
  const globals = getActiveGlobalFlags(optionKeys, features);
  const globalNames = new Set(globals.map((flag) => flag.name));
  const tokens = tokenizeArgv(remainingArgv, buildFlagModel(input.options, globals));

  const lastValue = (name: string) => {
    const values = tokens.flags.get(name);
    return values ? values[values.length - 1] : undefined;
  };
  const has = (name: string) => globalNames.has(name) && tokens.flags.has(name) && lastValue(name) !== false;
  const colorFlag =
    globalNames.has("color") && tokens.flags.has("color") ? lastValue("color") === true : undefined;
  const shouldUseAnsi = getShouldUseAnsi({ colorFlag, env, isTTY });

  return {
    tokens,
    optionKeys,
    globals,
    globalNames,
    colorFlag,
    shouldUseAnsi,
    paint: makePaint(shouldUseAnsi),
    isJSON: opts.format === "json" || (opts.format !== "pretty" && has("json")),
    has,
    lastValue,
  };
};
