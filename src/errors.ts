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

export const isGunsmithError = (e: unknown): e is GunsmithError => {
  if (e instanceof GunsmithError) return true;
  if (typeof e !== "object" || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (name === "GunsmithError" || name === "UsageError") && typeof code === "string";
};

export const getExitCodeForError = (code: GunsmithError["code"]) => (code === "UNKNOWN" ? 1 : 2);
