import type { z } from "zod";
import type { InputModel } from "./input";
import type { Merge } from "./utilities";

type ContextValue<Schema extends z.ZodObject<z.ZodRawShape> | undefined> =
  Schema extends z.ZodObject<z.ZodRawShape> ? z.infer<Schema> : Record<never, never>;

type OutputValue<Schema extends z.ZodType | undefined> = Schema extends z.ZodType ? z.infer<Schema> : unknown;

type CommandRunReturn<Schema extends z.ZodType | undefined> =
  Schema extends z.ZodType ? OutputValue<Schema> | Promise<OutputValue<Schema>> : unknown;

export type OutputValidationMode = "development" | boolean;

export interface CommandContextValue<Args, Options, Env> {
  name: string;
  args: Args;
  options: Options;
  env: Env;
  isTTY: boolean;
  isJSON: boolean;
  rest: string[];
  readStdin: () => Promise<string>;
}

export type Context<
  ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
> = CommandContextValue<ContextValue<ArgsSchema>, ContextValue<OptionsSchema>, ContextValue<EnvSchema>>;

export type ChildContext<
  ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  ParentOptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  ParentEnvSchema extends z.ZodObject<z.ZodRawShape> | undefined,
> = CommandContextValue<
  ContextValue<ArgsSchema>,
  Merge<ContextValue<ParentOptionsSchema>, ContextValue<OptionsSchema>>,
  Merge<ContextValue<ParentEnvSchema>, ContextValue<EnvSchema>>
>;

export interface CommandDefinition<
  ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  HandlerContext = Context<ArgsSchema, OptionsSchema, EnvSchema>,
  OutputSchema extends z.ZodType | undefined = undefined,
> {
  description?: string;
  args?: ArgsSchema;
  options?: OptionsSchema;
  env?: EnvSchema;
  outputSchema?: OutputSchema;
  validateOutput?: OutputValidationMode;
  alias?: string[] | string;
  examples?: { command: string; description?: string }[];
  version?: string;
  hidden?: boolean;
  run?: (context: HandlerContext) => CommandRunReturn<OutputSchema>;
}

export interface CliFeatures {
  mcp?: boolean;
  schema?: boolean;
  llms?: boolean;
}

export type AppDefinition<
  ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  HandlerContext = Context<ArgsSchema, OptionsSchema, EnvSchema>,
  OutputSchema extends z.ZodType | undefined = undefined,
> = Omit<
  CommandDefinition<ArgsSchema, OptionsSchema, EnvSchema, HandlerContext, OutputSchema>,
  "alias" | "hidden"
> & {
  features?: CliFeatures;
};

export type CommandChildDefinition<
  ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  OutputSchema extends z.ZodType | undefined,
  ParentOptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  ParentEnvSchema extends z.ZodObject<z.ZodRawShape> | undefined,
> = CommandDefinition<
  ArgsSchema,
  OptionsSchema,
  EnvSchema,
  ChildContext<ArgsSchema, OptionsSchema, EnvSchema, ParentOptionsSchema, ParentEnvSchema>,
  OutputSchema
>;

export type AnyCommandDefinition = CommandDefinition<
  z.ZodObject<z.ZodRawShape> | undefined,
  z.ZodObject<z.ZodRawShape> | undefined,
  z.ZodObject<z.ZodRawShape> | undefined,
  never,
  z.ZodType | undefined
>;

export interface CommandNode {
  name: string;
  def: AnyCommandDefinition;
}

export type CommandChildMatch = [name: string, node: CommandNode];

export interface CommandEntry {
  commandPath: string[];
  node: CommandNode;
  def: AnyCommandDefinition;
  chain: CommandNode[];
}

export interface CommandInvocation {
  node: CommandNode;
  helpNode: CommandNode;
  commandPath: string[];
  remainingArgv: string[];
  commandName: string;
  hasSubcommands: boolean;
  def: AnyCommandDefinition;
  input: InputModel;
}
