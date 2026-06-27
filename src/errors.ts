export class GunsmithError extends Error {
  readonly code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "VALIDATION";

  constructor(code: "COMMAND_NOT_FOUND" | "UNKNOWN" | "VALIDATION", message: string) {
    super(message);
    this.name = "GunsmithError";
    this.code = code;
  }
}

export const isGunsmithError = (e: unknown): e is GunsmithError =>
  e instanceof GunsmithError ||
  (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "GunsmithError");

export const getExitCodeForError = (code: GunsmithError["code"]) => (code === "UNKNOWN" ? 1 : 2);
