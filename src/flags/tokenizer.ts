import type { FlagModel, TokenizedArgv } from "../types/flags";

const readBooleanFlagValue = (value: string) => value !== "false" && value !== "0" && value !== "no";

export const isLongFlagToken = (token: string) => {
  return token.startsWith("--") && token.length > 2;
};

interface ArgvTokenizationState {
  flags: Map<string, (boolean | string)[]>;
  positionals: string[];
  rest: string[];
  unknown: string[];
  missing: string[];
}

interface LongFlagToken {
  name: string;
  inlineValue: string | undefined;
}

interface KnownLongFlag {
  name: string;
  isBoolean: boolean;
}

const pushFlag = (flags: Map<string, (boolean | string)[]>, name: string, value: boolean | string) => {
  const values = flags.get(name);
  if (values) values.push(value);
  else flags.set(name, [value]);
};

const readNextValueToken = (argv: string[], index: number) => {
  const next = argv[index + 1];
  if (next === undefined || next === "--" || isLongFlagToken(next)) return undefined;
  return { nextIndex: index + 1, value: next };
};

const parseLongFlagToken = (token: string): LongFlagToken => {
  const body = token.slice(2);
  const eq = body.indexOf("=");
  return {
    name: eq === -1 ? body : body.slice(0, eq),
    inlineValue: eq === -1 ? undefined : body.slice(eq + 1),
  };
};

const readKnownLongFlag = (
  flag: KnownLongFlag,
  inlineValue: string | undefined,
  argv: string[],
  index: number,
  state: ArgvTokenizationState,
) => {
  if (flag.isBoolean) {
    pushFlag(state.flags, flag.name, inlineValue === undefined ? true : readBooleanFlagValue(inlineValue));
    return index;
  }
  if (inlineValue !== undefined) {
    pushFlag(state.flags, flag.name, inlineValue);
    return index;
  }
  const spaced = readNextValueToken(argv, index);
  if (spaced) {
    pushFlag(state.flags, flag.name, spaced.value);
    return spaced.nextIndex;
  }
  state.missing.push(flag.name);
  return index;
};

const readLongFlagToken = (
  token: string,
  argv: string[],
  index: number,
  model: FlagModel,
  state: ArgvTokenizationState,
) => {
  const { name, inlineValue } = parseLongFlagToken(token);

  if (name.startsWith("no-")) {
    const negated = model.negatable(name);
    if (negated) {
      pushFlag(state.flags, negated, false);
      return index;
    }
  }

  const canonical = model.long(name);
  if (canonical) {
    return readKnownLongFlag(
      { name: canonical, isBoolean: model.isBoolean(canonical) },
      inlineValue,
      argv,
      index,
      state,
    );
  }

  state.unknown.push(`--${name}`);
  return index;
};

const SHORT_ALIAS_TOKEN = /^-[A-Za-z](?:=|$)/;

export const isShortAliasToken = (token: string) => SHORT_ALIAS_TOKEN.test(token);

const parseShortFlagToken = (token: string) => {
  const body = token.slice(1);
  const eq = body.indexOf("=");
  return {
    alias: eq === -1 ? body : body.slice(0, eq),
    inlineValue: eq === -1 ? undefined : body.slice(eq + 1),
  };
};

const readShortFlagToken = (
  token: string,
  argv: string[],
  index: number,
  model: FlagModel,
  state: ArgvTokenizationState,
): number | undefined => {
  const { alias, inlineValue } = parseShortFlagToken(token);
  const name = model.short(alias);
  if (!name) return undefined;
  return readKnownLongFlag({ name, isBoolean: model.isBoolean(name) }, inlineValue, argv, index, state);
};

export const tokenizeArgv = (argv: string[], model: FlagModel): TokenizedArgv => {
  const flags = new Map<string, (boolean | string)[]>();
  const state: ArgvTokenizationState = {
    flags,
    positionals: [],
    rest: [],
    unknown: [],
    missing: [],
  };
  let afterDashDash = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;

    if (afterDashDash) {
      state.rest.push(tok);
      continue;
    }
    if (tok === "--") {
      afterDashDash = true;
      continue;
    }

    if (tok.startsWith("--")) {
      i = readLongFlagToken(tok, argv, i, model, state);
      continue;
    }

    if (isShortAliasToken(tok)) {
      const nextIndex = readShortFlagToken(tok, argv, i, model, state);
      if (nextIndex !== undefined) {
        i = nextIndex;
        continue;
      }
    }

    state.positionals.push(tok);
  }

  return {
    flags,
    positionals: state.positionals,
    rest: state.rest,
    unknown: state.unknown,
    missing: state.missing,
  };
};
