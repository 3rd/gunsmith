import type { z } from "zod";
import type { FlagModel, GlobalFlag, ShouldConsumeFlagValueHandler } from "../types/flags";
import { getField, getShapeKeys, isBooleanOption, toKebabCase } from "../schemas/zod";
import { GLOBAL_FLAGS } from "./globals";

const toCamelCase = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export const buildFlagModel = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
  globals: readonly GlobalFlag[],
): FlagModel => {
  const optKeys = getShapeKeys(options);
  const known = new Set(optKeys);
  const longMap = new Map<string, string>();
  const boolNames = new Set<string>();

  for (const key of optKeys) {
    longMap.set(key, key);
    longMap.set(toKebabCase(key), key);
    if (isBooleanOption(getField(options, key))) boolNames.add(key);
  }
  for (const flag of globals) {
    if (known.has(flag.name)) continue;
    longMap.set(flag.name, flag.name);
    longMap.set(toKebabCase(flag.name), flag.name);
    if (flag.bool) boolNames.add(flag.name);
  }

  return {
    long: (raw) => longMap.get(raw) ?? (known.has(toCamelCase(raw)) ? toCamelCase(raw) : undefined),
    negatable: (no) => {
      const raw = no.slice(3);
      const name = longMap.get(raw) ?? (known.has(toCamelCase(raw)) ? toCamelCase(raw) : undefined);
      return name && boolNames.has(name) ? name : undefined;
    },
    isBoolean: (name) => boolNames.has(name),
  };
};

export const getShouldConsumeFlagValue = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
): ShouldConsumeFlagValueHandler => {
  const optionKeys = new Set(getShapeKeys(options));
  const model = buildFlagModel(options, GLOBAL_FLAGS);
  const valueGlobals = new Set(GLOBAL_FLAGS.filter((flag) => !flag.bool).map((flag) => flag.name));

  return (flagToken) => {
    if (flagToken.startsWith("--")) {
      let raw = flagToken.slice(2);
      if (raw.includes("=")) return false;
      if (raw.startsWith("no-")) raw = raw.slice(3);
      const name = model.long(raw);
      if (!name) return false;
      if (optionKeys.has(name)) return !model.isBoolean(name);
      return valueGlobals.has(name);
    }

    return false;
  };
};
