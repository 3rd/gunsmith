import type { CommandNode } from "../types/commands";
import type { FlagTokenRole } from "../types/flags";
import { isLongFlagToken, isShortAliasToken } from "../flags/tokenizer";
import { findCommandChild } from "./tree";

export interface CommandPathResolution {
  node: CommandNode;
  commandPath: string[];
  remainingArgv: string[];
}

export const resolveCommandPath = (
  root: CommandNode,
  argv: string[],
  getFlagRole?: (flagToken: string, commandPath: readonly string[]) => FlagTokenRole,
): CommandPathResolution => {
  let node = root;
  const commandPath: string[] = [];
  const remainingArgv: string[] = [];

  const readFlagToken = (token: string, index: number, consumesValue: boolean) => {
    remainingArgv.push(token);
    if (!consumesValue || token.includes("=")) return index;
    const value = argv[index + 1];
    if (value === undefined) return index;
    remainingArgv.push(value);
    return index + 1;
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--") && token.length < 3) {
      remainingArgv.push(...argv.slice(i));
      break;
    }
    if (isLongFlagToken(token)) {
      i = readFlagToken(token, i, getFlagRole?.(token, commandPath).consumesValue ?? false);
      continue;
    }
    if (isShortAliasToken(token)) {
      const role = getFlagRole?.(token, commandPath);
      if (role?.isFlag) {
        i = readFlagToken(token, i, role.consumesValue);
        continue;
      }
    }
    const child = findCommandChild(node, token);
    if (child) {
      const [name, next] = child;
      node = next;
      commandPath.push(name);
      continue;
    }
    remainingArgv.push(...argv.slice(i));
    break;
  }
  return { node, commandPath, remainingArgv };
};
