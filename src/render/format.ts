import type { makePaint } from "./color";

export const renderError = (code: string, message: string, paint: ReturnType<typeof makePaint>) => {
  const prefix = `error (${code}):`;
  return `${paint(prefix, "red", "bold")} ${message}\n`;
};
