import type { z } from "zod";

const WRAPPERS = new Set(["catch", "default", "nonoptional", "nullable", "optional", "prefault", "readonly"]);

export const toKebabCase = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export const getShape = (
  obj: z.ZodObject<z.ZodRawShape> | undefined,
): Record<string, z.ZodType> | undefined => {
  if (!obj) return undefined;
  return (obj as unknown as { shape: Record<string, z.ZodType> }).shape;
};

export const getBaseType = (schema: z.ZodType | undefined) => {
  let cur: unknown = schema;
  for (let i = 0; i < 12; i++) {
    const def = (cur as { _zod?: { def?: { type?: string; innerType?: unknown } } })?._zod?.def;
    if (!def?.type) return undefined;
    if (WRAPPERS.has(def.type)) {
      cur = def.innerType;
      continue;
    }
    return def.type;
  }
  return undefined;
};

export const isBooleanOption = (s: z.ZodType | undefined) => getBaseType(s) === "boolean";
export const isArrayOption = (s: z.ZodType | undefined) => getBaseType(s) === "array";

export const isOptional = (s: z.ZodType | undefined) => {
  let cur: unknown = s;
  for (let i = 0; i < 12; i++) {
    const def = (cur as { _zod?: { def?: { type?: string; innerType?: unknown } } })?._zod?.def;
    if (!def?.type) return false;
    if (
      def.type === "default" ||
      def.type === "optional" ||
      def.type === "prefault" ||
      def.type === "catch"
    ) {
      return true;
    }
    if (WRAPPERS.has(def.type)) {
      cur = def.innerType;
      continue;
    }
    return false;
  }
  return false;
};

export const getDescription = (s: z.ZodType | undefined) => {
  const meta = (s as { meta?: () => { description?: string } | undefined })?.meta?.();
  return meta?.description;
};

export const getAlias = (s: z.ZodType | undefined) => {
  const meta = (s as { meta?: () => { alias?: unknown } | undefined })?.meta?.();
  return typeof meta?.alias === "string" ? meta.alias : undefined;
};

export const getEnumValues = (s: z.ZodType | undefined): string[] | undefined => {
  let cur: unknown = s;
  for (let i = 0; i < 12; i++) {
    const def = (
      cur as { _zod?: { def?: { type?: string; innerType?: unknown; entries?: Record<string, unknown> } } }
    )?._zod?.def;
    if (!def?.type) return undefined;
    if (WRAPPERS.has(def.type)) {
      cur = def.innerType;
      continue;
    }
    if (def.type !== "enum" || !def.entries) return undefined;
    return Object.values(def.entries).filter((value): value is string => typeof value === "string");
  }
  return undefined;
};

export const getArrayElement = (s: z.ZodType | undefined): z.ZodType | undefined => {
  let cur: unknown = s;
  for (let i = 0; i < 12; i++) {
    const def = (cur as { _zod?: { def?: { type?: string; innerType?: unknown; element?: unknown } } })?._zod
      ?.def;
    if (!def?.type) return undefined;
    if (WRAPPERS.has(def.type)) {
      cur = def.innerType;
      continue;
    }
    return def.type === "array" ? (def.element as z.ZodType) : undefined;
  }
  return undefined;
};

export const hasObjectChecks = (s: z.ZodType | undefined) => {
  const checks = (s as { _zod?: { def?: { checks?: unknown[] } } } | undefined)?._zod?.def?.checks;
  return Array.isArray(checks) && checks.length > 0;
};

const UNPARSEABLE_FROM_ARGV = new Set(["bigint", "date", "int", "number"]);

export const findUnparseableInputType = (s: z.ZodType | undefined): string | undefined => {
  let cur: unknown = s;
  for (let i = 0; i < 12; i++) {
    const def = (
      cur as { _zod?: { def?: { type?: string; innerType?: unknown; element?: unknown; coerce?: boolean } } }
    )?._zod?.def;
    if (!def?.type) return undefined;
    if (def.type === "catch") return undefined;
    if (WRAPPERS.has(def.type)) {
      cur = def.innerType;
      continue;
    }
    if (def.type === "array") {
      cur = def.element;
      continue;
    }
    return UNPARSEABLE_FROM_ARGV.has(def.type) && def.coerce !== true ? def.type : undefined;
  }
  return undefined;
};

export const getShapeKeys = (obj: z.ZodObject<z.ZodRawShape> | undefined) => {
  return Object.keys(getShape(obj) ?? {});
};

export const getField = (obj: z.ZodObject<z.ZodRawShape> | undefined, key: string): z.ZodType | undefined => {
  return getShape(obj)?.[key];
};
