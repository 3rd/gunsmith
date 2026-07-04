export interface GlobalFlag {
  name: string;
  bool: boolean;
  description: string;
  alias?: string;
}

export interface FlagModel {
  long: (raw: string) => string | undefined;
  short: (alias: string) => string | undefined;
  negatable: (noName: string) => string | undefined;
  isBoolean: (name: string) => boolean;
}

export interface FlagTokenRole {
  isFlag: boolean;
  consumesValue: boolean;
}

export type ShouldConsumeFlagValueHandler = (flagToken: string) => FlagTokenRole;

export interface TokenizedArgv {
  flags: Map<string, (boolean | string)[]>;
  positionals: string[];
  rest: string[];
  unknown: string[];
  missing: string[];
}

export type FlagValues = (boolean | string)[];
