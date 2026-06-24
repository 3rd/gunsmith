export interface GlobalFlag {
  name: string;
  bool: boolean;
  description: string;
}

export interface FlagModel {
  long: (raw: string) => string | undefined;
  negatable: (noName: string) => string | undefined;
  isBoolean: (name: string) => boolean;
}

export type ShouldConsumeFlagValueHandler = (flagToken: string) => boolean;

export interface TokenizedArgv {
  flags: Map<string, (boolean | string)[]>;
  positionals: string[];
  rest: string[];
  unknown: string[];
  missing: string[];
}

export type FlagValues = (boolean | string)[];
