import type { z } from "zod";

export type InputPart = "args" | "env" | "options";

export interface InputModel {
  args: z.ZodObject<z.ZodRawShape> | undefined;
  options: z.ZodObject<z.ZodRawShape> | undefined;
  env: z.ZodObject<z.ZodRawShape> | undefined;
  argKeys: string[];
  optionKeys: string[];
  envKeys: string[];
}

export interface ParsedCommandInput {
  argsInput: Record<string, unknown>;
  optionsInput: Record<string, unknown>;
  envInput: Record<string, unknown>;
  excessPositionals: string[];
}
