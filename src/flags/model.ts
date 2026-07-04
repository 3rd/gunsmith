import type { z } from "zod";
import type { FlagModel, GlobalFlag, ShouldConsumeFlagValueHandler } from "../types/flags";
import { getAlias, getField, getShapeKeys, isBooleanOption, toKebabCase } from "../schemas/zod";
import { GLOBAL_FLAGS } from "./globals";
import { isShortAliasToken } from "./tokenizer";

const toCamelCase = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export const buildFlagModel = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
  globals: readonly GlobalFlag[],
): FlagModel => {
  const optKeys = getShapeKeys(options);
  const known = new Set(optKeys);
  const longMap = new Map<string, string>();
  const shortMap = new Map<string, string>();
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
    if (flag.alias) shortMap.set(flag.alias, flag.name);
    if (flag.bool) boolNames.add(flag.name);
  }
  for (const key of optKeys) {
    const alias = getAlias(getField(options, key));
    if (alias) shortMap.set(alias, key);
  }

  return {
    long: (raw) => longMap.get(raw) ?? (known.has(toCamelCase(raw)) ? toCamelCase(raw) : undefined),
    short: (alias) => shortMap.get(alias),
    negatable: (no) => {
      const raw = no.slice(3);
      const name = longMap.get(raw) ?? (known.has(toCamelCase(raw)) ? toCamelCase(raw) : undefined);
      return name && boolNames.has(name) ? name : undefined;
    },
    isBoolean: (name) => boolNames.has(name),
  };
};

export const getFlagTokenRole = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
): ShouldConsumeFlagValueHandler => {
  const optionKeys = new Set(getShapeKeys(options));
  const model = buildFlagModel(options, GLOBAL_FLAGS);
  const valueGlobals = new Set(GLOBAL_FLAGS.filter((flag) => !flag.bool).map((flag) => flag.name));
  const consumesValue = (name: string) =>
    optionKeys.has(name) ? !model.isBoolean(name) : valueGlobals.has(name);

  return (flagToken) => {
    if (flagToken.startsWith("--")) {
      let raw = flagToken.slice(2);
      if (raw.includes("=")) return { isFlag: true, consumesValue: false };
      if (raw.startsWith("no-")) raw = raw.slice(3);
      const name = model.long(raw);
      return { isFlag: true, consumesValue: name ? consumesValue(name) : false };
    }
    if (isShortAliasToken(flagToken)) {
      const eq = flagToken.indexOf("=");
      const name = model.short(eq === -1 ? flagToken.slice(1) : flagToken.slice(1, eq));
      if (!name) return { isFlag: false, consumesValue: false };
      return { isFlag: true, consumesValue: eq === -1 && consumesValue(name) };
    }
    return { isFlag: false, consumesValue: false };
  };
};

export const getEffectiveAliasOwners = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
  globals: readonly GlobalFlag[],
): Map<string, string> => {
  const known = new Set(getShapeKeys(options));
  const owners = new Map<string, string>();
  for (const flag of globals) {
    if (known.has(flag.name)) continue;
    if (flag.alias) owners.set(flag.alias, `global:${flag.name}`);
  }
  for (const key of getShapeKeys(options)) {
    const alias = getAlias(getField(options, key));
    if (alias) owners.set(alias, `option:${key}`);
  }
  return owners;
};
