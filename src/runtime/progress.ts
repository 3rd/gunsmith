import type { ProgressUpdate } from "../types/commands";

export const createProgressReporter = (onProgress: ((update: ProgressUpdate) => void) | undefined) => {
  let previousProgress: number | undefined;

  return ({ progress, total, message }: ProgressUpdate) => {
    if (!Number.isFinite(progress)) throw new RangeError(`progress must be a finite number, received ${progress}`);

    const hasValidTotal = total === undefined || Number.isFinite(total);
    if (!hasValidTotal) throw new RangeError(`progress total must be a finite number, received ${total}`);

    // MCP requires each progress value to exceed the previous one. The check runs on every
    // surface, including terminals and tests where updates are discarded, so a handler that
    // breaks the rule fails where its author runs it instead of only under an MCP client.
    const isIncreasing = previousProgress === undefined || progress > previousProgress;
    if (!isIncreasing) {
      throw new RangeError(`progress must increase with each update, received ${progress} after ${previousProgress}`);
    }

    previousProgress = progress;
    onProgress?.({
      progress,
      ...(total === undefined ? {} : { total }),
      ...(message === undefined ? {} : { message }),
    });
  };
};
