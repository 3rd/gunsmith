import { AsyncLocalStorage } from "node:async_hooks";

const METHODS = ["log", "info", "debug", "warn", "error"] as const;

type ConsoleMethod = (typeof METHODS)[number];
type ConsoleFn = (...args: unknown[]) => void;
export type ConsoleCapture = Partial<Record<ConsoleMethod, (args: unknown[]) => void>>;

const consoleCaptureStorage = new AsyncLocalStorage<ConsoleCapture>();
let depth = 0;
let original: Record<ConsoleMethod, ConsoleFn> | undefined;

const createConsoleRouter =
  (method: ConsoleMethod): ConsoleFn =>
  (...args: unknown[]) => {
    const capture = consoleCaptureStorage.getStore();
    const handler = capture?.[method];
    if (handler) handler(args);
    else original?.[method](...args);
  };

const installConsoleCapture = () => {
  if (depth++ > 0) return;
  original = Object.fromEntries(METHODS.map((method) => [method, console[method].bind(console)])) as Record<
    ConsoleMethod,
    ConsoleFn
  >;
  for (const method of METHODS) {
    console[method] = createConsoleRouter(method) as (typeof console)[typeof method];
  }
};

const uninstallConsoleCapture = () => {
  depth--;
  if (depth > 0 || !original) return;
  for (const method of METHODS) console[method] = original[method] as (typeof console)[typeof method];
  original = undefined;
};

export const withConsoleCapture = async <T>(
  capture: ConsoleCapture,
  runCaptured: () => Promise<T>,
): Promise<T> => {
  installConsoleCapture();
  try {
    return await consoleCaptureStorage.run(capture, runCaptured);
  } finally {
    uninstallConsoleCapture();
  }
};

export const suppressedConsole: ConsoleCapture = Object.fromEntries(
  METHODS.map((method) => [method, () => {}]),
) as ConsoleCapture;

// complete SGR (color/style) sequences only; cursor/erase/OSC sequences never match
const ANSI_COLOR_PATTERN = /\u001B\[[\d:;]*m/g;

const stripAnsiColors = (value: unknown) =>
  typeof value === "string" ? value.replace(ANSI_COLOR_PATTERN, "") : value;

export const createColorStrippingConsole = (): ConsoleCapture => {
  // forward to the enclosing capture (e.g. the testkit) instead of bypassing it
  const parent = consoleCaptureStorage.getStore();
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      (args: unknown[]) => {
        const stripped = args.map(stripAnsiColors);
        const forward = parent?.[method];
        if (forward) forward(stripped);
        else original?.[method](...stripped);
      },
    ]),
  ) as ConsoleCapture;
};
