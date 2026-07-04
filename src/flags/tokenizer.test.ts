import { describe, expect, test } from "bun:test";
import type { FlagModel } from "../types/flags";
import { tokenizeArgv } from "./tokenizer";

const model: FlagModel = {
  long: (raw) =>
    ({ loud: "loud", "save-dev": "saveDev", saveDev: "saveDev", port: "port", tags: "tags" })[raw],
  short: (alias) => ({ l: "loud", p: "port" })[alias],
  negatable: (no) => {
    if (no === "no-loud") return "loud";
    if (no === "no-save-dev") return "saveDev";
    return undefined;
  },
  isBoolean: (n) => n === "loud" || n === "saveDev",
};

const getTokenizedFlags = (argv: string[]) => Object.fromEntries(tokenizeArgv(argv, model).flags);

describe("tokenizeArgv", () => {
  test("long boolean + value option", () => {
    expect(getTokenizedFlags(["--loud", "--port", "3000"])).toEqual({ loud: [true], port: ["3000"] });
  });
  test("--flag=value", () => {
    expect(getTokenizedFlags(["--port=8080"])).toEqual({ port: ["8080"] });
  });
  test("negation", () => {
    expect(getTokenizedFlags(["--no-loud"])).toEqual({ loud: [false] });
    expect(getTokenizedFlags(["--no-save-dev"])).toEqual({ saveDev: [false] });
  });
  test("kebab maps to camel", () => {
    expect(getTokenizedFlags(["--save-dev"])).toEqual({ saveDev: [true] });
  });
  test("repeated value option accumulates", () => {
    expect(getTokenizedFlags(["--tags", "a", "--tags=b"])).toEqual({ tags: ["a", "b"] });
  });
  test("-- terminator routes to rest, unparsed", () => {
    const r = tokenizeArgv(["x", "--loud", "--", "--raw", "-z"], model);
    expect(r.positionals).toEqual(["x"]);
    expect(r.rest).toEqual(["--raw", "-z"]);
    expect(Object.fromEntries(r.flags)).toEqual({ loud: [true] });
  });
  test("single-dash tokens are positionals / values, not flags", () => {
    const r = tokenizeArgv(["-name", "--port", "-literal"], model);
    expect(r.positionals).toEqual(["-name"]);
    expect(Object.fromEntries(r.flags)).toEqual({ port: ["-literal"] });
  });
  test("-- terminator is not consumed as an option value", () => {
    const r = tokenizeArgv(["--port", "--", "-raw"], model);
    expect(r.missing).toEqual(["port"]);
    expect(r.rest).toEqual(["-raw"]);
  });
  test("unknown flags collected", () => {
    const r = tokenizeArgv(["--nope", "-z"], model);
    expect(r.positionals).toEqual(["-z"]);
    expect(r.unknown).toEqual(["--nope"]);
  });
  test("short alias for a boolean option", () => {
    expect(getTokenizedFlags(["-l"])).toEqual({ loud: [true] });
  });
  test("short alias for a value option: spaced and inline", () => {
    expect(getTokenizedFlags(["-p", "3000"])).toEqual({ port: ["3000"] });
    expect(getTokenizedFlags(["-p=8080"])).toEqual({ port: ["8080"] });
  });
  test("short alias missing its value is reported", () => {
    const r = tokenizeArgv(["-p"], model);
    expect(r.missing).toEqual(["port"]);
  });
  test("unaliased and multi-letter single-dash tokens stay positionals", () => {
    const r = tokenizeArgv(["-z", "-zz", "-l2"], model);
    expect(r.positionals).toEqual(["-z", "-zz", "-l2"]);
    expect(r.unknown).toEqual([]);
    expect(Object.fromEntries(r.flags)).toEqual({});
  });
});
