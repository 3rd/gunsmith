import type { CommandNode } from "../types/commands";
import { isLongFlagToken } from "../flags/tokenizer";
import { findCommandChild } from "./tree";

export interface CommandPathResolution {
  node: CommandNode;
  commandPath: string[];
  remainingArgv: string[];
}

export const resolveCommandPath = (
  root: CommandNode,
  argv: string[],
  getShouldConsumeValue?: (flagToken: string, commandPath: readonly string[]) => boolean,
): CommandPathResolution => {
  let node = root;
  const commandPath: string[] = [];
  const remainingArgv: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--") && token.length < 3) {
      remainingArgv.push(...argv.slice(i));
      break;
    }
    if (isLongFlagToken(token)) {
      remainingArgv.push(token);
      const shouldConsumeValue = getShouldConsumeValue?.(token, commandPath) ?? false;
      if (shouldConsumeValue && !token.includes("=")) {
        const value = argv[i + 1];
        if (value !== undefined) {
          remainingArgv.push(value);
          i++;
        }
      }
      continue;
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
