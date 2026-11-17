import type { CommandContextValue, ProgressUpdate } from "./commands";
import type { CommandErrorResult, CommandSuccessResult } from "./result";

export interface ServeOptions {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  /**
   * Receives the final exit code, exactly once per invocation. Default: record nonzero
   * codes via `process.exitCode` and let the event loop drain — no forced `process.exit`,
   * and a zero result never overwrites a handler-set `process.exitCode`. Provide
   * `(c) => process.exit(c)` to restore forced termination.
   */
  exit?: (code: number) => void;
  env?: Record<string, string | undefined>;
  stdin?: () => Promise<string>;
  isTTY?: boolean;
  hasStdin?: boolean;
  format?: "json" | "pretty";
  /**
   * Cancels a command run: aborting it aborts the handler's `signal`. When set, the caller owns
   * cancellation and gunsmith leaves SIGINT and SIGTERM alone during the run, whatever the
   * command's `interrupt`. The `--mcp` server ignores it; MCP clients cancel their own calls.
   */
  signal?: AbortSignal;
  /** Receives each `reportProgress` update. Default: updates are discarded, as on a terminal. */
  onProgress?: (update: ProgressUpdate) => void;
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
