import type { z } from "zod";
import type { CommandEntry, CommandNode } from "../types/commands";
import type { GlobalFlag } from "../types/flags";
import type { makePaint } from "./color";
import { getCommandAliases, getCommandChildren } from "../command/tree";
import { GLOBAL_FLAGS } from "../flags/globals";
import {
  getBaseType,
  getDescription,
  getField,
  getShapeKeys,
  isArrayOption,
  isBooleanOption,
  isOptional,
  toKebabCase,
} from "../schemas/zod";

const getArgumentUsage = (args: z.ZodObject<z.ZodRawShape> | undefined) => {
  const keys = getShapeKeys(args);
  return keys
    .map((k, i) => {
      const f = getField(args, k);
      const variadic = i === keys.length - 1 && isArrayOption(f);
      const inner = variadic ? `${k}...` : k;
      return isOptional(f) || variadic ? `[${inner}]` : `<${inner}>`;
    })
    .join(" ");
};

const getOptionLines = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
  paint: ReturnType<typeof makePaint>,
) => {
  return getShapeKeys(options).map((k) => {
    const f = getField(options, k);
    const optionName = `--${toKebabCase(k)}`;
    const names = `    ${paint(optionName, "yellow")}`;
    const type = getBaseType(f) ?? "string";
    const valueLabel = `<${type}>`;
    const value = isBooleanOption(f) ? "" : ` ${paint(valueLabel, "gray")}`;
    const requiredLabel = isOptional(f) ? "" : paint(" (required)", "gray");
    const desc = getDescription(f);
    const description = desc ? `  ${desc}` : "";
    return `  ${names}${value}${requiredLabel}${description}`;
  });
};

const getUsageLine = (
  node: CommandNode,
  commandPath: string[],
  binName: string,
  paint: ReturnType<typeof makePaint>,
) => {
  const usageParts = [paint([binName, ...commandPath].join(" "), "cyan", "bold")];
  if (getCommandChildren(node).size > 0) usageParts.push("<command>");
  if (node.def.options && getShapeKeys(node.def.options).length > 0) usageParts.push("[options]");
  const args = getArgumentUsage(node.def.args);
  if (args) usageParts.push(args);
  return `${paint("Usage:", "bold")} ${usageParts.join(" ")}`;
};

const pushArgumentLines = (lines: string[], node: CommandNode, paint: ReturnType<typeof makePaint>) => {
  const argKeys = getShapeKeys(node.def.args);
  if (argKeys.length === 0) return;

  lines.push("", paint("Arguments:", "bold"));
  for (const k of argKeys) {
    const f = getField(node.def.args, k);
    const d = getDescription(f);
    const typeLabel = `<${getBaseType(f) ?? "string"}>`;
    const description = d ? `  ${d}` : "";
    lines.push(`  ${paint(k, "cyan")} ${paint(typeLabel, "gray")}${description}`);
  }
};

const pushOptionLines = (lines: string[], node: CommandNode, paint: ReturnType<typeof makePaint>) => {
  if (!node.def.options || getShapeKeys(node.def.options).length === 0) return;

  lines.push("", paint("Options:", "bold"));
  lines.push(...getOptionLines(node.def.options, paint));
};

const pushCommandLines = (lines: string[], node: CommandNode, paint: ReturnType<typeof makePaint>) => {
  const children = getCommandChildren(node);
  if (children.size === 0) return;

  lines.push("", paint("Commands:", "bold"));
  for (const [name, child] of children) {
    if (child.def.hidden) continue;
    const aliases = getCommandAliases(child.def);
    const label = aliases.length > 0 ? `${name} (${aliases.join(", ")})` : name;
    const description = child.def.description ? `  ${child.def.description}` : "";
    lines.push(`  ${paint(label, "cyan")}${description}`);
  }
};

const pushExampleLines = (lines: string[], node: CommandNode, paint: ReturnType<typeof makePaint>) => {
  if (!node.def.examples || node.def.examples.length === 0) return;

  lines.push("", paint("Examples:", "bold"));
  for (const ex of node.def.examples) {
    if (ex.description) lines.push(`  ${paint("#", "gray")} ${ex.description}`);
    lines.push(`  ${ex.command}`);
  }
};

const getGlobalLabel = (g: GlobalFlag) => {
  if (g.name === "color") return "--color / --no-color";
  const value = g.bool ? "" : " <value>";
  return `--${toKebabCase(g.name)}${value}`;
};

export const renderHelp = (
  node: CommandNode,
  commandPath: string[],
  binName: string,
  paint: ReturnType<typeof makePaint>,
  globals: readonly GlobalFlag[] = GLOBAL_FLAGS,
) => {
  const lines: string[] = [getUsageLine(node, commandPath, binName, paint)];

  if (node.def.description) lines.push("", node.def.description);
  pushArgumentLines(lines, node, paint);
  pushOptionLines(lines, node, paint);
  pushCommandLines(lines, node, paint);
  pushExampleLines(lines, node, paint);

  lines.push("", paint("Global options:", "bold"));
  for (const g of globals) lines.push(`  ${paint(getGlobalLabel(g), "yellow")}  ${g.description}`);

  return `${lines.join("\n")}\n`;
};

const getFieldDescriptions = (obj: z.ZodObject<z.ZodRawShape> | undefined, prefix: string) => {
  return getShapeKeys(obj).map((k) => {
    const f = getField(obj, k);
    const req = isOptional(f) ? "optional" : "required";
    const d = getDescription(f);
    const description = d ? `: ${d}` : "";
    return `- ${prefix} \`${k}\` (${getBaseType(f) ?? "string"}, ${req})${description}`;
  });
};

const getOutputDescriptions = (schema: z.ZodType | undefined) => {
  if (!schema) return [];
  if (getBaseType(schema) !== "object") return [`- output (${getBaseType(schema) ?? "unknown"}, required)`];
  return getFieldDescriptions(schema as z.ZodObject<z.ZodRawShape>, "output");
};

export const renderLlms = (binName: string, entries: CommandEntry[]) => {
  const lines = [`# ${binName}`, ""];
  for (const e of entries) {
    if (e.def.hidden) continue;
    const name = [binName, ...e.commandPath].join(" ");
    lines.push(`## ${name}`);
    if (e.def.description) lines.push(e.def.description);
    const args = getFieldDescriptions(e.def.args, "arg");
    const opts = getFieldDescriptions(e.def.options, "option");
    const env = getFieldDescriptions(e.def.env, "env");
    const output = getOutputDescriptions(e.def.outputSchema);
    lines.push(...args, ...opts, ...env, ...output, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
};
