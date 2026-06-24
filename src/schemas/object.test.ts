import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { mergeObjects, toJsonSchema } from "./object";

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
