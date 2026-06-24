import { format } from "node:util";
import type { Cli } from "../create";
import type { TestJsonRunResult, TestJsonValue, TestRunOptions, TestRunResult } from "../types/testing";
import { type ConsoleCapture, withConsoleCapture } from "../runtime/console";
export type { TestJsonRunResult, TestJsonValue, TestRunOptions, TestRunResult } from "../types/testing";

interface CapturedOutput {
  stdout: string[];
  stderr: string[];
  exitCode: number;
  wroteFrameworkStdout: boolean;
}

type InternalTestRunResult<T = unknown> = TestRunResult<T> & { hasJson: boolean };

const formatConsoleArgs = (args: unknown[]) => `${format(...args)}\n`;

const createConsoleCapture = (output: CapturedOutput): ConsoleCapture => ({
  log: (args) => void output.stdout.push(formatConsoleArgs(args)),
  info: (args) => void output.stdout.push(formatConsoleArgs(args)),
  debug: (args) => void output.stdout.push(formatConsoleArgs(args)),
  error: (args) => void output.stderr.push(formatConsoleArgs(args)),
  warn: (args) => void output.stderr.push(formatConsoleArgs(args)),
});

const parseJsonResult = <T>(stdout: string) => {
  try {
    const json = JSON.parse(stdout) as TestJsonValue<T>;
    return { stdout: `${JSON.stringify(json)}\n`, json, hasJson: true };
  } catch {
    return { stdout, json: undefined, hasJson: false };
  }
};

const runCliWithOutputFormat = async <T>(
  app: Cli,
  argv: string[],
  opts: TestRunOptions,
  outputFormat: "json" | undefined,
): Promise<InternalTestRunResult<T>> => {
  const output: CapturedOutput = {
    stdout: [],
    stderr: [],
    exitCode: 0,
    wroteFrameworkStdout: false,
  };
  const stdin = opts.stdin;
  const readStdin = stdin === undefined ? undefined : async () => stdin;

  await withConsoleCapture(createConsoleCapture(output), async () => {
    await app.serve(argv, {
      stdout: (s) => {
        output.wroteFrameworkStdout = true;
        output.stdout.push(s);
      },
      stderr: (s) => {
        output.stderr.push(s);
      },
      exit: (code) => {
        output.exitCode = code;
      },
      env: opts.env ?? {},
      isTTY: opts.isTTY ?? false,
      stdin: readStdin,
      format: outputFormat,
    });
  });

  const stdout = output.stdout.join("");
  const stderr = output.stderr.join("");
  if (outputFormat !== "json" && !output.wroteFrameworkStdout) {
    return { stdout, stderr, exitCode: output.exitCode, json: undefined, hasJson: false };
  }
  const parsed = parseJsonResult<T>(stdout);
  return {
    stdout: parsed.stdout,
    stderr,
    exitCode: output.exitCode,
    json: parsed.json,
    hasJson: parsed.hasJson,
  };
};

export const runCli = async <T = unknown>(
  app: Cli,
  argv: string[],
  opts: TestRunOptions = {},
): Promise<TestRunResult<T>> => {
  const { hasJson: _, ...result } = await runCliWithOutputFormat<T>(app, argv, opts, undefined);
  return result;
};

export const runJson = async <T = unknown>(
  app: Cli,
  argv: string[],
  opts: TestRunOptions = {},
): Promise<TestJsonRunResult<T>> => {
  const result = await runCliWithOutputFormat<T>(app, argv, opts, "json");
  if (!result.hasJson) throw new Error("runJson expected JSON output");
  const { hasJson: _, ...publicResult } = result;
  return publicResult as TestJsonRunResult<T>;
};
