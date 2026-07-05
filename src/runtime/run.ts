import type { AnyCommandDefinition, OutputValidationMode } from "../types/commands";
import type { CommandRunContext, CommandRunResult } from "../types/execution";
import { getExitCodeForError, isGunsmithError } from "../errors";
import { parseOutputSchema } from "../schemas/validate";
import { createColorStrippingConsole, suppressedConsole, withConsoleCapture } from "./console";

const shouldValidateOutput = (mode: OutputValidationMode | undefined, nodeEnv: string | undefined) => {
  const resolved = mode ?? "development";
  if (resolved === true) return true;
  if (resolved === false) return false;
  return nodeEnv === "development";
};

const createUnknownErrorResult = (error: unknown, debug?: (message: string) => void): CommandRunResult => {
  debug?.(`${(error as Error).stack ?? String(error)}\n`);
  return {
    ok: false,
    error: { code: "UNKNOWN", message: (error as Error).message ?? String(error) },
    exitCode: 1,
  };
};

const createThrownErrorResult = (error: unknown, debug?: (message: string) => void): CommandRunResult => {
  if (isGunsmithError(error)) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
      exitCode: getExitCodeForError(error.code),
    };
  }
  return createUnknownErrorResult(error, debug);
};

export const runCommand = async (
  def: AnyCommandDefinition,
  baseContext: CommandRunContext,
  opts: { suppressConsole?: boolean; debug?: (message: string) => void; nodeEnv?: string } = {},
): Promise<CommandRunResult> => {
  const run = async (): Promise<CommandRunResult> => {
    try {
      const retval = await def.run!(baseContext as never);
      const returnedData = retval === undefined ? null : retval;
      const data =
        def.outputSchema && shouldValidateOutput(def.validateOutput, opts.nodeEnv) ?
          parseOutputSchema(def.outputSchema, returnedData)
        : returnedData;
      return { ok: true, data };
    } catch (error) {
      return createThrownErrorResult(error, opts.debug);
    }
  };

  if (opts.suppressConsole) return withConsoleCapture(suppressedConsole, run);
  if (!baseContext.shouldUseColor) return withConsoleCapture(createColorStrippingConsole(), run);
  return run();
};
