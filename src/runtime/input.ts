import type { z } from "zod";
import type { FlagValues } from "../types/flags";
import type { ParsedCommandInput } from "../types/input";
import { getSchemaEnvInput } from "../schemas/input-model";
import { getField, getShapeKeys, isArrayOption, isOptional } from "../schemas/zod";

type ParseCommandInputParams = {
  args?: z.ZodObject<z.ZodRawShape>;
  options?: z.ZodObject<z.ZodRawShape>;
  env?: z.ZodObject<z.ZodRawShape>;
  flags: Map<string, FlagValues>;
  positionals: string[];
  processEnv: Record<string, string | undefined>;
};

const collectOptionInput = (
  options: z.ZodObject<z.ZodRawShape> | undefined,
  flags: Map<string, FlagValues>,
) => {
  const optionsInput: Record<string, unknown> = {};
  for (const key of getShapeKeys(options)) {
    const flagValues = flags.get(key);
    if (flagValues && flagValues.length > 0) {
      optionsInput[key] =
        isArrayOption(getField(options, key)) ? flagValues : flagValues[flagValues.length - 1];
    }
  }
  return optionsInput;
};

const collectArgsInput = (args: z.ZodObject<z.ZodRawShape> | undefined, positionals: string[]) => {
  const argKeys = getShapeKeys(args);
  const lastIndex = argKeys.length - 1;
  const lastArgKey = argKeys.at(-1);
  const lastIsArray = lastArgKey !== undefined && isArrayOption(getField(args, lastArgKey));
  const argsInput: Record<string, unknown> = {};
  let excessPositionals: string[] = [];

  for (const [index, argKey] of argKeys.entries()) {
    if (index === lastIndex && lastIsArray) {
      const collected = positionals.slice(index);
      if (collected.length > 0) argsInput[argKey] = collected;
      else if (!isOptional(getField(args, argKey))) argsInput[argKey] = [];
    } else if (positionals[index] !== undefined) {
      argsInput[argKey] = positionals[index];
    }
  }
  if (!lastIsArray && positionals.length > argKeys.length) {
    excessPositionals = positionals.slice(argKeys.length);
  }
  return { argsInput, excessPositionals };
};

export const parseCommandInput = (params: ParseCommandInputParams): ParsedCommandInput => {
  const { args, options, env, flags, positionals, processEnv } = params;
  const optionsInput = collectOptionInput(options, flags);
  const { argsInput, excessPositionals } = collectArgsInput(args, positionals);
  const envInput = getSchemaEnvInput(env, processEnv);

  return { argsInput, optionsInput, envInput, excessPositionals };
};
