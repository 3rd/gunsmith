import type { CommandContextValue } from "./commands";
import type { CommandErrorResult, CommandSuccessResult } from "./result";

export interface ServeOptions {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  exit?: (code: number) => void;
  env?: Record<string, string | undefined>;
  stdin?: () => Promise<string>;
  isTTY?: boolean;
  format?: "json" | "pretty";
}

export type CommandRunContext = CommandContextValue<unknown, unknown, unknown>;

export type CommandRunResult =
  | { ok: false; error: { code: string; message: string }; exitCode: number }
  | { ok: true; data: unknown };

export interface CommandInputValues {
  argsInput: Record<string, unknown>;
  optionsInput: Record<string, unknown>;
  envInput: Record<string, unknown>;
}

export type CommandInvocationResult =
  | { ok: false; result: CommandErrorResult; error: { code: string; message: string }; exitCode: number }
  | { ok: true; result: CommandSuccessResult; exitCode: 0 };
