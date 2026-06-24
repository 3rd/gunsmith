import type { CommandErrorResult, CommandSuccessResult } from "../types/result";

export const createSuccessResult = (data: unknown): CommandSuccessResult => {
  return {
    ok: true,
    data: data === undefined ? null : data,
  };
};

export const createErrorResult = (code: string, message: string): CommandErrorResult => {
  return { ok: false, error: { code, message } };
};
