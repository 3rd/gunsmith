import type { z } from "zod";
import type { AnyCommandDefinition } from "../types/commands";
import type { InputModel, InputPart } from "../types/input";
import { GunsmithError } from "../errors";
import { getDuplicateKeyMessage, getDuplicateKeys, mergeObjects, toInputJsonSchema } from "./object";
import { getShapeKeys } from "./zod";

export const buildInputModel = (def: AnyCommandDefinition): InputModel => {
  return {
    args: def.args,
    options: def.options,
    env: def.env,
    argKeys: getShapeKeys(def.args),
    optionKeys: getShapeKeys(def.options),
    envKeys: getShapeKeys(def.env),
  };
};

const getInputSchemas = (model: InputModel, parts: readonly InputPart[]) => {
  return parts.map((part) => model[part]);
};

export const assertUniqueInputKeys = (model: InputModel, parts: readonly InputPart[]) => {
  const conflicts = getDuplicateKeys(getInputSchemas(model, parts));
  if (conflicts.length > 0) throw new GunsmithError("VALIDATION", getDuplicateKeyMessage(conflicts));
};

export const getInputJsonSchema = (
  model: InputModel,
  parts: readonly InputPart[],
): Record<string, unknown> => {
  return toInputJsonSchema(mergeObjects(getInputSchemas(model, parts)));
};

export const splitNamedInput = (model: InputModel, rawInput: Record<string, unknown>) => {
  const argKeys = new Set(model.argKeys);
  const optionKeys = new Set(model.optionKeys);
  const argsInput: Record<string, unknown> = {};
  const optionsInput: Record<string, unknown> = {};
  let unknownKey: string | undefined;

  for (const [key, value] of Object.entries(rawInput)) {
    if (argKeys.has(key)) argsInput[key] = value;
    else if (optionKeys.has(key)) optionsInput[key] = value;
    else unknownKey ??= key;
  }

  return { argsInput, optionsInput, unknownKey };
};

const getEnvInputForKeys = (
  envKeys: readonly string[],
  processEnv: Record<string, string | undefined>,
): Record<string, unknown> => {
  const input: Record<string, unknown> = {};
  for (const key of envKeys) {
    const value = processEnv[key];
    if (value !== undefined) input[key] = value;
  }
  return input;
};

export const getEnvInput = (
  model: InputModel,
  processEnv: Record<string, string | undefined>,
): Record<string, unknown> => {
  return getEnvInputForKeys(model.envKeys, processEnv);
};

export const getSchemaEnvInput = (
  env: z.ZodObject<z.ZodRawShape> | undefined,
  processEnv: Record<string, string | undefined>,
): Record<string, unknown> => {
  return getEnvInputForKeys(getShapeKeys(env), processEnv);
};
