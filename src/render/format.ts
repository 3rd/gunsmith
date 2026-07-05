import type { makePaint } from "./color";

export const renderError = (message: string, paint: ReturnType<typeof makePaint>) => {
  return `${paint("error:", "red", "bold")} ${message}\n`;
};
