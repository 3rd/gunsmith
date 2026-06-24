export class PicocliError extends Error {
  readonly code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "VALIDATION";

  constructor(code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "VALIDATION", message: string) {
    super(message);
    this.name = "PicocliError";
    this.code = code;
  }
}

export const isPicocliError = (e: unknown): e is PicocliError =>
  e instanceof PicocliError ||
  (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "PicocliError");

export const getExitCodeForError = (code: PicocliError["code"]) => (code === "UNKNOWN" ? 1 : 2);
