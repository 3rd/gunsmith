export type JsonValue = JsonValue[] | { [key: string]: JsonValue } | boolean | number | string | null;

export interface JsonSchemaOverrideContext {
  zodSchema: { _zod?: { def?: { type?: string } } };
  jsonSchema: Record<string, unknown>;
}
