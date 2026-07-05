import type { AnyCommandDefinition } from "../types/commands";
import type { CommandInputValues, CommandInvocationResult, CommandRunResult } from "../types/execution";
import type { InputModel } from "../types/input";
import { getExitCodeForError, type GunsmithError, isGunsmithError } from "../errors";
import { createErrorResult, createSuccessResult } from "../render/result";
import { validateAll } from "../schemas/validate";
import { runCommand } from "./run";

type InvokeCommandParams = {
  def: AnyCommandDefinition;
  input: InputModel;
  name: string;
  inputs: CommandInputValues;
  isTTY: boolean;
  isJSON: boolean;
  shouldUseColor: boolean;
  hasStdin: boolean;
  rest: string[];
  readStdin: () => Promise<string>;
  suppressConsole: boolean;
  debug?: (message: string) => void;
  nodeEnv?: string;
};

type ValidatedCommandInput = ReturnType<typeof validateAll>;

const validateCommandInput = (
  input: InputModel,
  values: CommandInputValues,
): GunsmithError | ValidatedCommandInput => {
  try {
    return validateAll({
      args: input.args,
      options: input.options,
      env: input.env,
      argsInput: values.argsInput,
      optionsInput: values.optionsInput,
      envInput: values.envInput,
    });
  } catch (error) {
    if (!isGunsmithError(error)) throw error;
    return error;
  }
};

const createValidationResult = (error: GunsmithError): CommandInvocationResult => ({
  ok: false,
  result: createErrorResult(error.code, error.message),
  error: { code: error.code, message: error.message },
  exitCode: getExitCodeForError(error.code),
});

const createInvocationResult = (result: CommandRunResult): CommandInvocationResult => {
  if (result.ok) {
    return {
      ok: true,
      result: createSuccessResult(result.data),
      exitCode: 0,
    };
  }

  return {
    ok: false,
    result: createErrorResult(result.error.code, result.error.message),
    error: result.error,
    exitCode: result.exitCode,
  };
};

export const invokeCommand = async (params: InvokeCommandParams): Promise<CommandInvocationResult> => {
  const {
    def,
    input,
    name,
    inputs,
    isTTY,
    isJSON,
    shouldUseColor,
    hasStdin,
    rest,
    readStdin,
    suppressConsole,
    debug,
    nodeEnv,
  } = params;
  const parsed = validateCommandInput(input, inputs);

  if (isGunsmithError(parsed)) return createValidationResult(parsed);

  const result = await runCommand(
    def,
    {
      name,
      args: parsed.args,
      options: parsed.options,
      env: parsed.env,
      isTTY,
      isJSON,
      shouldUseColor,
      hasStdin,
      rest,
      readStdin,
    },
    { suppressConsole, debug, nodeEnv },
  );
  return createInvocationResult(result);
};
