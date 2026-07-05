import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { mergeObjects, toInputJsonSchema, toJsonSchema } from "./object";

describe("toJsonSchema", () => {
  test("coerced date does not throw and becomes date-time string", () => {
    const merged = mergeObjects([z.object({ when: z.coerce.date() }), undefined]);
    const js = toJsonSchema(merged) as { properties: Record<string, { type?: string; format?: string }> };
    expect(js.properties.when).toEqual({ type: "string", format: "date-time" });
  });
  test("coerced number is type number (output mode)", () => {
    const js = toJsonSchema(z.object({ port: z.coerce.number() })) as {
      properties: Record<string, { type?: string }>;
    };
    expect(js.properties.port?.type).toBe("number");
  });
  test("enum becomes a string enum", () => {
    const js = toJsonSchema(z.object({ level: z.enum(["a", "b"]) })) as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(js.properties.level?.enum).toEqual(["a", "b"]);
  });
  test("bigint degrades to {} instead of throwing (unrepresentable: any)", () => {
    const js = toJsonSchema(z.object({ big: z.bigint() })) as {
      properties: Record<string, object>;
    };
    expect(js.properties.big).toEqual({});
  });
});

describe("mergeObjects", () => {
  test("merges args + options shapes; undefined parts ignored", () => {
    const merged = mergeObjects([z.object({ a: z.string() }), z.object({ b: z.number() }), undefined]);
    const js = toJsonSchema(merged) as { properties: Record<string, unknown> };
    expect(Object.keys(js.properties)).toEqual(["a", "b"]);
  });
  test("all undefined -> undefined", () => {
    expect(mergeObjects([undefined, undefined])).toBeUndefined();
  });
});

describe("toInputJsonSchema", () => {
  test("defaulted fields are optional with the default present", () => {
    const js = toInputJsonSchema(
      z.object({
        clipboard: z.boolean().default(false),
        engine: z.enum(["a", "b"]).default("a"),
        name: z.string(),
      }),
    ) as { required?: string[]; properties: Record<string, { default?: unknown }> };
    expect(js.required).toEqual(["name"]);
    expect(js.properties.clipboard?.default).toBe(false);
    expect(js.properties.engine?.default).toBe("a");
  });
  test("output mode keeps defaulted fields required", () => {
    const js = toJsonSchema(z.object({ clipboard: z.boolean().default(false) })) as {
      required?: string[];
    };
    expect(js.required).toEqual(["clipboard"]);
  });
});
