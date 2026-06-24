export type CommandSuccessResult<T = unknown> = { ok: true; data: T };
export type CommandErrorResult = { ok: false; error: { code: string; message: string } };
export type CommandResult<T = unknown> = CommandErrorResult | CommandSuccessResult<T>;
