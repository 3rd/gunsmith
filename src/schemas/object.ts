import { z } from "zod";
import type { JsonSchemaOverrideContext } from "../types/json";
import { getShape } from "./zod";

// z.date() / z.coerce.date() are unrepresentable in JSON Schema; remap to ISO string
const overrideDateJsonSchema = (ctx: JsonSchemaOverrideContext) => {
  if (ctx.zodSchema?._zod?.def?.type === "date") {
    const jsonSchema = ctx.jsonSchema;
    jsonSchema.type = "string";
    jsonSchema.format = "date-time";
  }
};

// merge z.object shapes
export const mergeObjects = (
  parts: (z.ZodObject<z.ZodRawShape> | undefined)[],
): z.ZodObject<z.ZodRawShape> | undefined => {
  const shapes = parts
    .map(getShape)
    .filter((shape): shape is NonNullable<typeof shape> => shape !== undefined);
  if (shapes.length === 0) return undefined;
  return z.object(Object.assign({}, ...shapes));
};

export const getDuplicateKeys = (parts: (z.ZodObject<z.ZodRawShape> | undefined)[]) => {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const part of parts) {
    const shape = getShape(part);
    for (const key of Object.keys(shape ?? {})) {
      if (seen.has(key)) duplicate.add(key);
      else seen.add(key);
    }
  }
  return [...duplicate].sort();
};

export const getDuplicateKeyMessage = (keys: string[]) => {
  return `schema fields must be unique across merged inputs: ${keys.join(", ")}`;
};

export const toJsonSchema = (schema: z.ZodType | undefined): Record<string, unknown> => {
  if (!schema) return { type: "object", properties: {}, additionalProperties: false };
  return z.toJSONSchema(schema, {
    unrepresentable: "any",
    override: overrideDateJsonSchema as (ctx: unknown) => void,
  }) as Record<string, unknown>;
};
