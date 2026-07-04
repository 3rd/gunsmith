import cli, { Cli } from "./create";
export { GunsmithError, isGunsmithError } from "./errors";
export type {
  AppDefinition,
  CliFeatures,
  CommandDefinition,
  CommandFeatures,
  Context,
  OutputValidationMode,
} from "./types/commands";
export type { ServeOptions } from "./types/execution";
export type { CommandErrorResult, CommandResult, CommandSuccessResult } from "./types/result";
export type { JsonValue } from "./types/json";

export default cli;
export const create = cli.create;
export const command = cli.command;
export { Cli };
