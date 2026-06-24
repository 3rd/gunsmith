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
