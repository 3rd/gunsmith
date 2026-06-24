import { describe, expect, test } from "bun:test";
import { getShouldUseAnsi, makePaint } from "./color";

const getShouldUseAnsiFor = (
  colorFlag: boolean | undefined,
  env: Record<string, string | undefined>,
  isTTY: boolean,
) => getShouldUseAnsi({ colorFlag, env, isTTY });

describe("getShouldUseAnsi", () => {
  test("--no-color flag wins over everything", () => {
    expect(getShouldUseAnsiFor(false, { FORCE_COLOR: "3" }, true)).toBe(false);
  });
  test("--color flag forces on", () => {
    expect(getShouldUseAnsiFor(true, { NO_COLOR: "1" }, false)).toBe(true);
  });
  test("FORCE_COLOR wins over NO_COLOR", () => {
    expect(getShouldUseAnsiFor(undefined, { FORCE_COLOR: "1", NO_COLOR: "1" }, false)).toBe(true);
  });
  test("FORCE_COLOR=0 disables", () => {
    expect(getShouldUseAnsiFor(undefined, { FORCE_COLOR: "0" }, true)).toBe(false);
  });
  test("NO_COLOR (non-empty) disables", () => {
    expect(getShouldUseAnsiFor(undefined, { NO_COLOR: "1" }, true)).toBe(false);
  });
  test("empty NO_COLOR is ignored per no-color.org", () => {
    expect(getShouldUseAnsiFor(undefined, { NO_COLOR: "" }, true)).toBe(true);
  });
  test("falls back to isTTY", () => {
    expect(getShouldUseAnsiFor(undefined, {}, true)).toBe(true);
    expect(getShouldUseAnsiFor(undefined, {}, false)).toBe(false);
  });
});

describe("makePaint", () => {
  test("disabled ANSI returns the raw string", () => {
    expect(makePaint(false)("x", "red", "bold")).toBe("x");
  });
  test("enabled ANSI wraps in ANSI codes", () => {
    expect(makePaint(true)("x", "green")).toBe("\u001b[32mx\u001b[0m");
  });
});
