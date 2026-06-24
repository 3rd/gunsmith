import type { z } from "zod";
import { PicocliError } from "../errors";

const parseSchema = <S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  input: Record<string, unknown>,
  kind: "argument" | "environment variable" | "option",
): z.infer<S> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issue = (result.error.issues[0] ?? {}) as z.ZodIssue;
  const field = issue.path?.join(".") || "(input)";
  const expected = "expected" in issue ? String(issue.expected) : undefined;
  // only the numeric types are a likely "forgot z.coerce" mistake (booleans are presence flags)
  const coercible = expected === "number" || expected === "int" || expected === "bigint";
  const hint =
    coercible ? ` (CLI values arrive as strings — use z.coerce.${expected}() for non-string ${kind}s)` : "";
  const message = `invalid ${kind} "${field}": ${issue.message}${hint}`;
  throw new PicocliError("VALIDATION", message);
};

export const parseOutputSchema = <S extends z.ZodType>(schema: S, data: unknown): z.infer<S> => {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issue = (result.error.issues[0] ?? {}) as z.ZodIssue;
  const field = issue.path?.join(".") || "(output)";
  const message = `invalid output "${field}": ${issue.message}`;
  throw new PicocliError("VALIDATION", message);
};

export const validateAll = (params: {
  args?: z.ZodObject<z.ZodRawShape>;
  options?: z.ZodObject<z.ZodRawShape>;
  env?: z.ZodObject<z.ZodRawShape>;
  argsInput: Record<string, unknown>;
  optionsInput: Record<string, unknown>;
  envInput: Record<string, unknown>;
}) => {
  const { args, options, env, argsInput, optionsInput, envInput } = params;
  return {
    args: args ? parseSchema(args, argsInput, "argument") : {},
    options: options ? parseSchema(options, optionsInput, "option") : {},
    env: env ? parseSchema(env, envInput, "environment variable") : {},
  };
};
