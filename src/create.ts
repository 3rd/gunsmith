import type { z } from "zod";
import type {
  AnyCommandDefinition,
  AppDefinition,
  CliFeatures,
  CommandChildDefinition,
  CommandDefinition,
  CommandNode,
  Context,
} from "./types/commands";
import type { ServeOptions } from "./types/execution";
import { clearCommandTreeIssueCache, getCommandChildren, setCommandChild } from "./command/tree";
import { GunsmithError } from "./errors";
import { serve } from "./runtime/serve";

type CliKind = "app" | "command";
type AnyCli = Cli<z.ZodObject<z.ZodRawShape> | undefined, z.ZodObject<z.ZodRawShape> | undefined, CliKind>;

const parentCliMap = new WeakMap<AnyCli, Set<AnyCli>>();
const commandCliSet = new WeakSet<AnyCli>();

const resolveCliFeatures = (features?: CliFeatures): Required<CliFeatures> => ({
  mcp: features?.mcp ?? true,
  schema: features?.schema ?? true,
  llms: features?.llms ?? true,
  json: features?.json ?? true,
  color: features?.color ?? true,
  completions: features?.completions ?? true,
});

const clearCachedTreeIssues = (cli: AnyCli): void => {
  clearCommandTreeIssueCache(cli);
  for (const parent of parentCliMap.get(cli) ?? []) clearCachedTreeIssues(parent);
};

const containsCommandNode = (
  root: CommandNode,
  target: CommandNode,
  seen = new WeakSet<CommandNode>(),
): boolean => {
  if (root === target) return true;
  if (seen.has(root)) return false;
  seen.add(root);
  for (const [, child] of getCommandChildren(root)) {
    if (containsCommandNode(child, target, seen)) return true;
  }
  return false;
};

export class Cli<
  ParentOptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  ParentEnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  Kind extends CliKind = CliKind,
> {
  private declare readonly kind: Kind;

  readonly name: string;
  readonly def: AnyCommandDefinition;
  readonly features: Required<CliFeatures>;

  constructor(name: string, def?: AnyCommandDefinition, features?: CliFeatures) {
    this.name = name;
    this.def = features ? { ...def, features } : (def ?? {});
    this.features = resolveCliFeatures(features ?? def?.features);
  }

  command<
    ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OutputSchema extends z.ZodType | undefined = undefined,
  >(
    name: string,
    def:
      | (CommandChildDefinition<
          ArgsSchema,
          OptionsSchema,
          EnvSchema,
          OutputSchema,
          undefined,
          ParentEnvSchema
        > & { inheritOptions: false })
      | (CommandChildDefinition<
          ArgsSchema,
          OptionsSchema,
          EnvSchema,
          OutputSchema,
          ParentOptionsSchema,
          ParentEnvSchema
        > & { inheritOptions?: true }),
  ): this;
  command(
    sub: Cli<z.ZodObject<z.ZodRawShape> | undefined, z.ZodObject<z.ZodRawShape> | undefined, "command">,
  ): this;
  command(
    a:
      | Cli<z.ZodObject<z.ZodRawShape> | undefined, z.ZodObject<z.ZodRawShape> | undefined, "command">
      | string,
    b?: AnyCommandDefinition,
  ): this {
    const name = typeof a === "string" ? a : a.name;
    if (getCommandChildren(this).has(name)) {
      throw new GunsmithError("VALIDATION", `command "${name}" already exists under "${this.name}"`);
    }
    if (typeof a === "string") setCommandChild(this, name, { name, def: b ?? {} });
    else {
      if (!commandCliSet.has(a)) {
        throw new GunsmithError("VALIDATION", `command "${name}" must be created with cli.command(...)`);
      }
      if (containsCommandNode(a, this)) {
        throw new GunsmithError("VALIDATION", `command "${name}" cannot be mounted into its own tree`);
      }
      const parents = parentCliMap.get(a) ?? new Set<AnyCli>();
      parents.add(this);
      parentCliMap.set(a, parents);
      setCommandChild(this, name, a);
    }
    clearCachedTreeIssues(this);
    return this;
  }

  serve(argv?: string[], opts?: ServeOptions): Promise<number> {
    return serve(this, argv ?? process.argv.slice(2), opts ?? {});
  }
}

const cli = {
  create: <
    ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OutputSchema extends z.ZodType | undefined = undefined,
  >(
    name: string,
    def?: AppDefinition<
      ArgsSchema,
      OptionsSchema,
      EnvSchema,
      Context<ArgsSchema, OptionsSchema, EnvSchema>,
      OutputSchema
    >,
  ): Cli<OptionsSchema, EnvSchema, "app"> => {
    return new Cli<OptionsSchema, EnvSchema, "app">(
      name,
      def as AnyCommandDefinition | undefined,
      def?.features,
    );
  },
  command: <
    ArgsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OptionsSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    EnvSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
    OutputSchema extends z.ZodType | undefined = undefined,
  >(
    name: string,
    def?: CommandDefinition<
      ArgsSchema,
      OptionsSchema,
      EnvSchema,
      Context<ArgsSchema, OptionsSchema, EnvSchema>,
      OutputSchema
    >,
  ): Cli<OptionsSchema, EnvSchema, "command"> => {
    const command = new Cli<OptionsSchema, EnvSchema, "command">(
      name,
      def as AnyCommandDefinition | undefined,
    );
    commandCliSet.add(command);
    return command;
  },
};
export default cli;
