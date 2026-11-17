export class GunsmithError extends Error {
  readonly code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "USAGE" | "VALIDATION";

  constructor(code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "USAGE" | "VALIDATION", message: string) {
    super(message);
    this.name = "GunsmithError";
    this.code = code;
  }
}

export class UsageError extends GunsmithError {
  constructor(message: string) {
    super("USAGE", message);
    this.name = "UsageError";
  }
}

export class CommandError extends Error {
  readonly code: string;
  readonly exitCode: 1 | 2;

  constructor(code: string, message: string, options: { exitCode?: 1 | 2 } = {}) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
  }
}

export const isGunsmithError = (e: unknown): e is GunsmithError => {
  if (e instanceof GunsmithError) return true;
  if (typeof e !== "object" || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (name === "GunsmithError" || name === "UsageError") && typeof code === "string";
};

export const isCommandError = (e: unknown): e is CommandError => {
  if (e instanceof CommandError) return true;

  const isObject = typeof e === "object" && e !== null;
  if (!isObject) return false;

  const { name, code, exitCode } = e as { name?: unknown; code?: unknown; exitCode?: unknown };

  return name === "CommandError" && typeof code === "string" && (exitCode === 1 || exitCode === 2);
};

export const getExitCodeForError = (code: GunsmithError["code"]) => (code === "UNKNOWN" ? 1 : 2);
