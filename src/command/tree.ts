import type { AnyCommandDefinition, CommandChildMatch, CommandEntry, CommandNode } from "../types/commands";
import { isLongFlagToken } from "../flags/tokenizer";
import { mergeObjects } from "../schemas/object";

const isValidCommandName = (name: string) => name.length > 0 && !isLongFlagToken(name) && name !== "--";
const commandTreeIssueCache = new WeakMap<CommandNode, string | undefined>();
const commandChildrenMap = new WeakMap<CommandNode, Map<string, CommandNode>>();
const emptyCommandChildren: ReadonlyMap<string, CommandNode> = new Map();

export const getCommandAliases = (def: AnyCommandDefinition) =>
  typeof def.alias === "string" ? [def.alias] : (def.alias ?? []);

export const clearCommandTreeIssueCache = (root: CommandNode) => {
  commandTreeIssueCache.delete(root);
};

export const getCommandChildren = (node: CommandNode): ReadonlyMap<string, CommandNode> => {
  return commandChildrenMap.get(node) ?? emptyCommandChildren;
};

export const setCommandChild = (node: CommandNode, name: string, child: CommandNode) => {
  const children = commandChildrenMap.get(node) ?? new Map<string, CommandNode>();
  children.set(name, child);
  commandChildrenMap.set(node, children);
};

export const createCommandNodeView = (node: CommandNode, def: AnyCommandDefinition): CommandNode => {
  const view = { name: node.name, def };
  const children = commandChildrenMap.get(node);
  if (children) commandChildrenMap.set(view, children);
  return view;
};

export const findCommandTreeIssue = (root: CommandNode) => {
  if (commandTreeIssueCache.has(root)) return commandTreeIssueCache.get(root);

  const walk = (node: CommandNode): string | undefined => {
    const owner = node.name;
    const seen = new Map<string, string>();
    const children = getCommandChildren(node);
    for (const [name, child] of children) {
      if (!isValidCommandName(name)) return `invalid command name "${name}" under "${owner}"`;
      const existing = seen.get(name);
      if (existing) return `command name "${name}" for "${name}" conflicts with ${existing}`;
      seen.set(name, `command "${name}"`);
      for (const alias of getCommandAliases(child.def)) {
        if (!isValidCommandName(alias)) return `invalid alias "${alias}" for command "${name}"`;
        const conflict = seen.get(alias);
        if (conflict) return `alias "${alias}" for command "${name}" conflicts with ${conflict}`;
        seen.set(alias, `command "${name}"`);
      }
    }
    for (const child of children.values()) {
      const issue = walk(child);
      if (issue) return issue;
    }
    return undefined;
  };
  const issue = walk(root);
  commandTreeIssueCache.set(root, issue);
  return issue;
};

export const getChildNames = (node: CommandNode) => {
  const names: string[] = [];
  for (const [name, child] of getCommandChildren(node)) names.push(name, ...getCommandAliases(child.def));
  return names;
};

export const findCommandChild = (node: CommandNode, token: string): CommandChildMatch | undefined => {
  const children = getCommandChildren(node);
  const direct = children.get(token);
  if (direct) return [token, direct];
  for (const [name, child] of children) {
    if (getCommandAliases(child.def).includes(token)) return [name, child];
  }
  return undefined;
};

export const getCommandChain = (root: CommandNode, commandPath: string[]): CommandNode[] => {
  const chain = [root];
  let node = root;
  for (const name of commandPath) {
    const child = getCommandChildren(node).get(name);
    if (!child) throw new Error(`internal command path missing: ${commandPath.join(" ")}`);
    chain.push(child);
    node = child;
  }
  return chain;
};

export const getEffectiveCommandDefinition = (chain: CommandNode[]): AnyCommandDefinition => {
  const node = chain[chain.length - 1];
  if (!node) return {};
  return {
    ...node.def,
    options: mergeObjects(chain.map((n) => n.def.options)),
    env: mergeObjects(chain.map((n) => n.def.env)),
  };
};

export const collectCommandEntries = (root: CommandNode): CommandEntry[] => {
  const entries: CommandEntry[] = [];
  const walk = (node: CommandNode, commandPath: string[], ancestors: CommandNode[]) => {
    if (node.def.hidden) return;
    const chain = [...ancestors, node];
    entries.push({ commandPath, node, chain, def: getEffectiveCommandDefinition(chain) });
    for (const [name, child] of getCommandChildren(node)) walk(child, [...commandPath, name], chain);
  };
  walk(root, [], []);
  return entries;
};
