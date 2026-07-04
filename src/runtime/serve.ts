import type { Cli } from "../create";
import type { CommandInvocationResult, ServeOptions } from "../types/execution";
import { collectCommandEntries, getChildNames } from "../command/tree";
import { getExitCodeForError, GunsmithError, isGunsmithError } from "../errors";
import { renderError } from "../render/format";
import { renderHelp, renderLlms } from "../render/help";
import { createErrorResult } from "../render/result";
import { suggest } from "../render/suggest";
import { assertUniqueInputKeys, getInputJsonSchema } from "../schemas/input-model";
import { toJsonSchema } from "../schemas/object";
import { toKebabCase } from "../schemas/zod";
import { parseGlobals, resolveInvocation } from "./argv";
import {
  COMPLETION_SHELLS,
  getCompletionCandidates,
  isCompletionSafeBinName,
  isCompletionShell,
  renderCompletionScript,
} from "./completions";
import { parseCommandInput } from "./input";
import { invokeCommand } from "./invoke";

const loadMcp = async () => {
  const distSpecifier = "./mcp/index.js";
  try {
    return (await import(distSpecifier)) as typeof import("../mcp/index");
  } catch (error) {
    const sourceSpecifier = "../mcp/index";
    try {
      return (await import(sourceSpecifier)) as typeof import("../mcp/index");
    } catch {
      throw error;
    }
  }
};

const readProcessStdin = async () => {
  const stdin = process.stdin;
  if (stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

const createServeContext = (root: Cli, argv: string[], opts: ServeOptions) => {
  const stdout = opts.stdout ?? ((s: string) => void process.stdout.write(s));
  const stderr = opts.stderr ?? ((s: string) => void process.stderr.write(s));
  const exit = opts.exit ?? ((c: number) => process.exit(c));
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const isTTY = opts.isTTY ?? Boolean(process.stdout.isTTY);
  const invocation = resolveInvocation(root, argv);
  const parsedGlobals = parseGlobals({
    input: invocation.input,
    remainingArgv: invocation.remainingArgv,
    opts,
    env,
    isTTY,
    features: root.features,
  });

  return { root, opts, stdout, stderr, exit, env, isTTY, invocation, parsedGlobals };
};

type ServeContext = ReturnType<typeof createServeContext>;

const writeJsonLine = (write: (value: string) => void, value: unknown) => {
  write(`${JSON.stringify(value)}\n`);
};

const writeFailure = (ctx: ServeContext, error: GunsmithError) => {
  if (ctx.parsedGlobals.isJSON) writeJsonLine(ctx.stdout, createErrorResult(error.code, error.message));
  else ctx.stderr(renderError(error.code, error.message, ctx.parsedGlobals.paint));
  return ctx.exit(getExitCodeForError(error.code));
};

const finishCommand = (ctx: ServeContext, result: CommandInvocationResult) => {
  if (ctx.parsedGlobals.isJSON) writeJsonLine(ctx.stdout, result.ok ? result.result.data : result.result);
  else if (!result.ok) {
    ctx.stderr(renderError(result.error.code, result.error.message, ctx.parsedGlobals.paint));
  }
  return ctx.exit(result.exitCode);
};

const writeHelp = (ctx: ServeContext) => {
  const generated = renderHelp(
    ctx.invocation.helpNode,
    ctx.invocation.commandPath,
    ctx.root.name,
    ctx.parsedGlobals.paint,
    ctx.parsedGlobals.globals,
  );
  const custom = ctx.invocation.def.help;
  const helpText = typeof custom === "function" ? custom(generated) : (custom ?? generated);
  ctx.stdout(helpText.endsWith("\n") ? helpText : `${helpText}\n`);
};

const handleHelpOrVersion = async (ctx: ServeContext) => {
  if (ctx.parsedGlobals.has("help")) {
    writeHelp(ctx);
    ctx.exit(0);
    return true;
  }
  if (ctx.parsedGlobals.has("version")) {
    ctx.stdout(`${ctx.invocation.def.version ?? ctx.root.def.version ?? "0.0.0"}\n`);
    ctx.exit(0);
    return true;
  }
  return false;
};

const handleGlobalParseError = (ctx: ServeContext) => {
  const { parsedGlobals } = ctx;
  if (parsedGlobals.tokens.missing.length > 0) {
    writeFailure(
      ctx,
      new GunsmithError(
        "VALIDATION",
        `option "--${toKebabCase(parsedGlobals.tokens.missing[0]!)}" requires a value`,
      ),
    );
    return true;
  }
  if (parsedGlobals.has("format")) {
    const value = parsedGlobals.lastValue("format");
    if (value !== "json" && value !== "pretty") {
      const sugg = suggest(String(value), ["pretty", "json"]);
      const hint = sugg.length > 0 ? `; did you mean "${sugg[0]}"?` : "";
      writeFailure(
        ctx,
        new GunsmithError("VALIDATION", `invalid --format "${value}"; expected pretty or json${hint}`),
      );
      return true;
    }
  }
  return false;
};

const handleCompletionsScript = (ctx: ServeContext) => {
  const { parsedGlobals } = ctx;
  if (!parsedGlobals.has("completions")) return false;
  const value = parsedGlobals.lastValue("completions");
  if (!isCompletionShell(value)) {
    const sugg = suggest(String(value), [...COMPLETION_SHELLS]);
    const hint = sugg.length > 0 ? `; did you mean "${sugg[0]}"?` : "";
    writeFailure(
      ctx,
      new GunsmithError("VALIDATION", `invalid --completions "${value}"; expected bash, zsh, or fish${hint}`),
    );
    return true;
  }
  if (!isCompletionSafeBinName(ctx.root.name)) {
    writeFailure(
      ctx,
      new GunsmithError(
        "VALIDATION",
        `completions are not available for binary name "${ctx.root.name}"; expected letters, digits, ".", "_", "+", or "-"`,
      ),
    );
    return true;
  }
  ctx.stdout(renderCompletionScript(ctx.root.name, value));
  ctx.exit(0);
  return true;
};

const handleSchemaManifestOrMcp = async (ctx: ServeContext) => {
  const { env, invocation, parsedGlobals, root } = ctx;
  if (parsedGlobals.has("schema")) {
    try {
      assertUniqueInputKeys(invocation.input, ["args", "options"]);
    } catch (error) {
      if (isGunsmithError(error)) writeFailure(ctx, error);
      else throw error;
      return true;
    }
    ctx.stdout(
      `${JSON.stringify(
        {
          input: getInputJsonSchema(invocation.input, ["args", "options"]),
          output: invocation.def.outputSchema ? toJsonSchema(invocation.def.outputSchema) : null,
        },
        null,
        2,
      )}\n`,
    );
    ctx.exit(0);
    return true;
  }
  if (parsedGlobals.has("llms")) {
    ctx.stdout(renderLlms(root.name, collectCommandEntries(root)));
    ctx.exit(0);
    return true;
  }
  if (parsedGlobals.has("mcp")) {
    const mcp = await loadMcp();
    await mcp.serveMcp(root, { env });
    return true;
  }
  return false;
};

const handleUnknownOption = (ctx: ServeContext) => {
  const { parsedGlobals } = ctx;
  if (parsedGlobals.tokens.unknown.length === 0) return false;
  const bad = parsedGlobals.tokens.unknown[0]!;
  const known = [
    ...parsedGlobals.optionKeys.map(toKebabCase),
    ...parsedGlobals.globals.map((flag) => flag.name),
  ];
  const sugg = bad.startsWith("--") ? suggest(bad.slice(2), known) : [];
  const hint = sugg.length > 0 ? `; did you mean "--${sugg[0]}"?` : "";
  writeFailure(ctx, new GunsmithError("VALIDATION", `unknown option "${bad}"${hint}`));
  return true;
};

const handleNonRunnableCommand = (ctx: ServeContext) => {
  const { invocation, parsedGlobals } = ctx;
  if (invocation.hasSubcommands && !invocation.def.run) {
    if (parsedGlobals.tokens.positionals.length > 0) {
      const first = parsedGlobals.tokens.positionals[0]!;
      const sugg = suggest(first, getChildNames(invocation.node));
      const hint = sugg.length > 0 ? `; did you mean "${sugg[0]}"?` : "";
      writeFailure(ctx, new GunsmithError("COMMAND_NOT_FOUND", `unknown command "${first}"${hint}`));
      return true;
    }
    writeHelp(ctx);
    ctx.exit(0);
    return true;
  }
  if (!invocation.def.run) {
    writeHelp(ctx);
    ctx.exit(0);
    return true;
  }
  return false;
};

const runCommandInvocation = async (ctx: ServeContext) => {
  const { env, invocation, isTTY, opts, parsedGlobals, stderr } = ctx;
  const cmdFlags = new Map(
    [...parsedGlobals.tokens.flags].filter(([name]) => !parsedGlobals.globalNames.has(name)),
  );
  const commandInput = parseCommandInput({
    args: invocation.input.args,
    options: invocation.input.options,
    env: invocation.input.env,
    flags: cmdFlags,
    positionals: parsedGlobals.tokens.positionals,
    processEnv: env,
  });

  if (commandInput.excessPositionals.length > 0) {
    return writeFailure(
      ctx,
      new GunsmithError("VALIDATION", `unexpected argument "${commandInput.excessPositionals[0]}"`),
    );
  }

  const result = await invokeCommand({
    def: invocation.def,
    input: invocation.input,
    name: invocation.commandName,
    inputs: {
      argsInput: commandInput.argsInput,
      optionsInput: commandInput.optionsInput,
      envInput: commandInput.envInput,
    },
    isTTY,
    isJSON: parsedGlobals.isJSON,
    rest: parsedGlobals.tokens.rest,
    readStdin: opts.stdin ?? readProcessStdin,
    suppressConsole: parsedGlobals.isJSON,
    debug: env.DEBUG ? stderr : undefined,
    nodeEnv: env.NODE_ENV,
  });

  return finishCommand(ctx, result);
};

export const serve = async (root: Cli, argv: string[], opts: ServeOptions) => {
  if (root.features.completions && argv[0] === "__complete") {
    const stdout = opts.stdout ?? ((s: string) => void process.stdout.write(s));
    const exit = opts.exit ?? ((c: number) => process.exit(c));
    let candidates: string[] = [];
    try {
      candidates = getCompletionCandidates(root, argv.slice(1));
    } catch {
      // completion must never break the shell; fall through with no candidates
    }
    if (candidates.length > 0) stdout(`${candidates.join("\n")}\n`);
    return exit(0);
  }
  const ctx = createServeContext(root, argv, opts);
  if (await handleHelpOrVersion(ctx)) return;
  if (handleGlobalParseError(ctx)) return;
  if (handleCompletionsScript(ctx)) return;
  if (await handleSchemaManifestOrMcp(ctx)) return;
  if (handleUnknownOption(ctx)) return;
  if (handleNonRunnableCommand(ctx)) return;
  return runCommandInvocation(ctx);
};
