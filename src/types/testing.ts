import type { CommandErrorResult } from "./result";

export type TestJsonValue<T = unknown> = CommandErrorResult | T;

export interface TestRunResult<T = unknown> {
  stdout: string;
  stderr: string;
  exitCode: number;
  json: TestJsonValue<T> | undefined;
}

export interface TestJsonRunResult<T = unknown> extends TestRunResult<T> {
  json: TestJsonValue<T>;
}

export interface TestRunOptions {
  /**
   * Replaces the process environment for the run — omitted means an empty environment,
   * not `process.env`. Spread explicitly to inherit ambient values:
   * `{ ...process.env, MY_VAR: "1" }`.
   */
  env?: Record<string, string | undefined>;
  /** stdout TTY state as seen by the command. Defaults to `false` (CI-shaped). */
  isTTY?: boolean;
  /**
   * Piped stdin content: `ctx.readStdin()` resolves to this value and `ctx.hasStdin`
   * becomes `true`. Omitted means no piped stdin (`ctx.hasStdin` is `false`).
   */
  stdin?: string;
}
