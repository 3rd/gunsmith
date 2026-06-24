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
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  stdin?: string;
}
