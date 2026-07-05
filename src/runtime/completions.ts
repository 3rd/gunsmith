import type { z } from "zod";
import type { Cli } from "../create";
import type { FlagModel, GlobalFlag } from "../types/flags";
import { getCommandAliases, getCommandChildren, getEffectiveCliFeatures } from "../command/tree";
import { COMPLETION_SHELLS, getActiveGlobalFlags } from "../flags/globals";
import { buildFlagModel, getEffectiveAliasOwners } from "../flags/model";
import { getAlias, getDescription, getEnumValues, getField, getShapeKeys, toKebabCase } from "../schemas/zod";
import { resolveInvocation } from "./argv";

export { COMPLETION_SHELLS };
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export const isCompletionShell = (value: unknown): value is CompletionShell =>
  COMPLETION_SHELLS.includes(value as CompletionShell);

const toCandidateLine = (name: string, description?: string) =>
  description ? `${name}\t${description}` : name;

const getFlagCandidates = (options: z.ZodObject<z.ZodRawShape> | undefined, globals: GlobalFlag[]) => {
  const aliasOwners = getEffectiveAliasOwners(options, globals);
  const lines: string[] = [];
  for (const key of getShapeKeys(options)) {
    const field = getField(options, key);
    const description = getDescription(field);
    const alias = getAlias(field);
    lines.push(toCandidateLine(`--${toKebabCase(key)}`, description));
    if (alias && aliasOwners.get(alias) === `option:${key}`) {
      lines.push(toCandidateLine(`-${alias}`, description));
    }
  }
  for (const flag of globals) {
    lines.push(toCandidateLine(`--${toKebabCase(flag.name)}`, flag.description));
    if (flag.alias && aliasOwners.get(flag.alias) === `global:${flag.name}`) {
      lines.push(toCandidateLine(`-${flag.alias}`, flag.description));
    }
  }
  return lines;
};

const readValueFlagName = (token: string | undefined, model: FlagModel) => {
  if (!token || token.includes("=")) return undefined;
  if (token.startsWith("--")) {
    const raw = token.slice(2);
    if (raw.startsWith("no-")) return undefined;
    const name = model.long(raw);
    return name && !model.isBoolean(name) ? name : undefined;
  }
  if (token.startsWith("-") && token.length === 2) {
    const name = model.short(token.slice(1));
    return name && !model.isBoolean(name) ? name : undefined;
  }
  return undefined;
};

export const getCompletionCandidates = (root: Cli, tokens: string[]): string[] => {
  const current = tokens.at(-1) ?? "";
  const prior = tokens.slice(0, -1);
  if (prior.includes("--")) return [];

  const invocation = resolveInvocation(root, prior);
  const features = getEffectiveCliFeatures(root.features, invocation.chain);
  const globals = getActiveGlobalFlags(invocation.input.optionKeys, features);
  const model = buildFlagModel(invocation.input.options, globals);

  const valueFlag = readValueFlagName(prior.at(-1), model);
  if (valueFlag) {
    const preset = globals.find((flag) => flag.name === valueFlag)?.values;
    if (preset) return [...preset];
    return getEnumValues(getField(invocation.input.options, valueFlag)) ?? [];
  }

  if (current.startsWith("-")) return getFlagCandidates(invocation.input.options, globals);

  const lines: string[] = [];
  for (const [name, child] of getCommandChildren(invocation.node)) {
    if (child.def.hidden) continue;
    lines.push(toCandidateLine(name, child.def.description));
    for (const alias of getCommandAliases(child.def)) {
      lines.push(toCandidateLine(alias, child.def.description));
    }
  }
  return lines;
};

const SAFE_BIN_NAME = /^[\dA-Za-z][\w+.-]*$/;

export const isCompletionSafeBinName = (name: string) => SAFE_BIN_NAME.test(name);

const sanitizeIdentifier = (name: string) => name.replace(/\W/g, "_");

const renderBashScript = (bin: string, fn: string) => `${fn}() {
    local cur candidates
    cur="\${COMP_WORDS[COMP_CWORD]}"
    candidates="$(${bin} __complete "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null | cut -f1)"
    COMPREPLY=($(compgen -W "$candidates" -- "$cur"))
}
complete -F ${fn} ${bin}
`;

const renderZshScript = (bin: string, fn: string) => `#compdef ${bin}
${fn}() {
    local line
    local -a lines completions
    lines=("\${(@f)$(${bin} __complete "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
    for line in "\${lines[@]}"; do
        [[ -z "$line" ]] && continue
        if [[ "$line" == *$'\\t'* ]]; then
            completions+=("\${line%%$'\\t'*}:\${line#*$'\\t'}")
        else
            completions+=("$line")
        fi
    done
    _describe '${bin}' completions
}
compdef ${fn} ${bin}
`;

const renderFishScript = (bin: string, fn: string) => `function ${fn}
    set -l tokens (commandline -opc)
    set -l current (commandline -ct)
    ${bin} __complete $tokens[2..] "$current" 2>/dev/null
end
complete -c ${bin} -f -a '(${fn})'
`;

const SCRIPT_RENDERERS: Record<CompletionShell, (bin: string, fn: string) => string> = {
  bash: renderBashScript,
  fish: renderFishScript,
  zsh: renderZshScript,
};

export const renderCompletionScript = (binName: string, shell: CompletionShell) =>
  SCRIPT_RENDERERS[shell](binName, `_${sanitizeIdentifier(binName)}_completions`);
