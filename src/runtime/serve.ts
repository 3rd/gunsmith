import type { Cli } from "../create";
import type { CommandInvocationResult, ServeOptions } from "../types/execution";
import { collectCommandEntries, getChildNames, getEffectiveCliFeatures } from "../command/tree";
import { getExitCodeForError, GunsmithError, isGunsmithError } from "../errors";
import { isForceColorOn } from "../render/color";
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
  // env read defeats bundler constant-folding; slice(0, 0) discards it so env cannot redirect the import
  const opaque = (specifier: string) => (process.env.GUNSMITH_OPAQUE_IMPORT ?? "").slice(0, 0) + specifier;
  try {
    return (await import(
      /* @vite-ignore */ /* webpackIgnore: true */ opaque("./mcp/index.js")
    )) as typeof import("../mcp/index");
  } catch (error) {
    try {
      return (await import(
        /* @vite-ignore */ /* webpackIgnore: true */ opaque("../mcp/index")
      )) as typeof import("../mcp/index");
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

// record nonzero codes and let the loop drain; zero never overwrites a handler-set exitCode
const defaultExit = (code: number) => {
  if (code !== 0) process.exitCode = code;
};

const createServeContext = (root: Cli, argv: string[], opts: ServeOptions) => {
  const stdout = opts.stdout ?? ((s: string) => void process.stdout.write(s));
  const stderr = opts.stderr ?? ((s: string) => void process.stderr.write(s));
  const exit = opts.exit ?? defaultExit;
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const isTTY = opts.isTTY ?? Boolean(process.stdout.isTTY);
  // piped iff a stdin reader was injected or real stdin is not an interactive terminal
  const hasStdin = opts.hasStdin ?? (opts.stdin !== undefined || !process.stdin.isTTY);
  const invocation = resolveInvocation(root, argv);
  const features = getEffectiveCliFeatures(root.features, invocation.chain);
  const parsedGlobals = parseGlobals({
    input: invocation.input,
    remainingArgv: invocation.remainingArgv,
    opts,
    env,
    isTTY,
    features,
  });

  return { root, opts, stdout, stderr, exit, env, isTTY, hasStdin, invocation, parsedGlobals };
};

type ServeContext = ReturnType<typeof createServeContext>;

const writeJsonLine = (write: (value: string) => void, value: unknown) => {
  write(`${JSON.stringify(value)}\n`);
};

const writeFailure = (ctx: ServeContext, error: GunsmithError): number => {
  if (ctx.parsedGlobals.isJSON) writeJsonLine(ctx.stdout, createErrorResult(error.code, error.message));
  else ctx.stderr(renderError(error.message, ctx.parsedGlobals.paint));
  return getExitCodeForError(error.code);
};

const finishCommand = (ctx: ServeContext, result: CommandInvocationResult): number => {
  if (ctx.parsedGlobals.isJSON) writeJsonLine(ctx.stdout, result.ok ? result.result.data : result.result);
  else if (!result.ok) {
    ctx.stderr(renderError(result.error.message, ctx.parsedGlobals.paint));
  }
  return result.exitCode;
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

const handleHelpOrVersion = (ctx: ServeContext): number | undefined => {
  if (ctx.parsedGlobals.has("help")) {
    writeHelp(ctx);
    return 0;
  }
  if (ctx.parsedGlobals.has("version")) {
    ctx.stdout(`${ctx.invocation.def.version ?? ctx.root.def.version ?? "0.0.0"}\n`);
    return 0;
  }
  return undefined;
};

const handleGlobalParseError = (ctx: ServeContext): number | undefined => {
  const { parsedGlobals } = ctx;
  if (parsedGlobals.tokens.missing.length > 0) {
    return writeFailure(
      ctx,
      new GunsmithError(
        "VALIDATION",
        `option "--${toKebabCase(parsedGlobals.tokens.missing[0]!)}" requires a value`,
      ),
    );
  }
  return undefined;
};

const handleCompletionsScript = (ctx: ServeContext): number | undefined => {
  const { parsedGlobals, root, stdout } = ctx;
  if (!parsedGlobals.has("completions")) return undefined;
  const value = parsedGlobals.lastValue("completions");
  if (!isCompletionShell(value)) {
    const sugg = suggest(String(value), [...COMPLETION_SHELLS]);
    const hint = sugg.length > 0 ? `; did you mean "${sugg[0]}"?` : "";
    return writeFailure(
      ctx,
      new GunsmithError(
        "VALIDATION",
        `invalid --completions "${value}"; expected ${COMPLETION_SHELLS.join(", ")}${hint}`,
      ),
    );
  }
  if (!isCompletionSafeBinName(root.name)) {
    return writeFailure(
      ctx,
      new GunsmithError(
        "VALIDATION",
        `completions are not available for binary name "${root.name}"; expected letters, digits, ".", "_", "+", or "-"`,
      ),
    );
  }
  stdout(renderCompletionScript(root.name, value));
  return 0;
};

const handleSchemaManifestOrMcp = async (ctx: ServeContext): Promise<number | undefined> => {
  const { env, invocation, parsedGlobals, root } = ctx;
  if (parsedGlobals.has("schema")) {
    try {
      assertUniqueInputKeys(invocation.input, ["args", "options"]);
    } catch (error) {
      if (isGunsmithError(error)) return writeFailure(ctx, error);
      throw error;
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
    return 0;
  }
  if (parsedGlobals.has("llms")) {
    ctx.stdout(renderLlms(root.name, collectCommandEntries(root)));
    return 0;
  }
  if (parsedGlobals.has("mcp")) {
    const mcp = await loadMcp();
    await mcp.serveMcp(root, { env });
    return 0;
  }
  return undefined;
};

const handleUnknownOption = (ctx: ServeContext): number | undefined => {
  const { parsedGlobals } = ctx;
  if (parsedGlobals.tokens.unknown.length === 0) return undefined;
  const bad = parsedGlobals.tokens.unknown[0]!;
  const known = [
    ...parsedGlobals.optionKeys.map(toKebabCase),
    ...parsedGlobals.globals.map((flag) => flag.name),
  ];
  const sugg = bad.startsWith("--") ? suggest(bad.slice(2), known) : [];
  const hint = sugg.length > 0 ? `; did you mean "--${sugg[0]}"?` : "";
  return writeFailure(ctx, new GunsmithError("VALIDATION", `unknown option "${bad}"${hint}`));
};

const handleNonRunnableCommand = (ctx: ServeContext): number | undefined => {
  const { invocation, parsedGlobals } = ctx;
  if (invocation.hasSubcommands && !invocation.def.run) {
    if (parsedGlobals.tokens.positionals.length > 0) {
      const first = parsedGlobals.tokens.positionals[0]!;
      const sugg = suggest(first, getChildNames(invocation.node));
      const hint = sugg.length > 0 ? `; did you mean "${sugg[0]}"?` : "";
      return writeFailure(ctx, new GunsmithError("COMMAND_NOT_FOUND", `unknown command "${first}"${hint}`));
    }
    writeHelp(ctx);
    return 0;
  }
  if (!invocation.def.run) {
    writeHelp(ctx);
    return 0;
  }
  return undefined;
};

const runCommandInvocation = async (ctx: ServeContext) => {
  const { env, hasStdin, invocation, isTTY, opts, parsedGlobals, stderr } = ctx;

  // propagate an explicit --no-color to Node's formatting and subprocesses for this invocation;
  // real env only. Only the flag is propagated: it is a per-invocation user instruction with no
  // other channel to reach subprocesses, whereas ambient NO_COLOR/FORCE_COLOR already reach
  // children through env inheritance, and on non-TTY runs children detect the same pipe and
  // disable color themselves — injecting there would leak synthetic vars into handlers that
  // treat the env as data (env dumps, forwarding to daemons)
  const propagateNoColor = parsedGlobals.colorFlag === false && opts.env === undefined;
  const setNoColor = propagateNoColor && process.env.NO_COLOR === undefined;
  // downstream consumers (Node, chalk, ...) let FORCE_COLOR beat NO_COLOR, so an ambient truthy
  // FORCE_COLOR must also be turned off for NO_COLOR=1 to stick; the explicit flag outranks it
  const forceColorToRestore =
    propagateNoColor && isForceColorOn(process.env.FORCE_COLOR) ? process.env.FORCE_COLOR : undefined;
  if (setNoColor) process.env.NO_COLOR = "1";
  if (forceColorToRestore !== undefined) process.env.FORCE_COLOR = "0";
  try {
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
      shouldUseColor: parsedGlobals.shouldUseAnsi,
      hasStdin,
      rest: parsedGlobals.tokens.rest,
      readStdin: opts.stdin ?? readProcessStdin,
      suppressConsole: parsedGlobals.isJSON,
      debug: env.DEBUG ? stderr : undefined,
      nodeEnv: env.NODE_ENV,
    });

    return finishCommand(ctx, result);
  } finally {
    if (setNoColor) delete process.env.NO_COLOR;
    if (forceColorToRestore !== undefined) process.env.FORCE_COLOR = forceColorToRestore;
  }
};

const resolveExitCode = async (ctx: ServeContext): Promise<number> => {
  const helpOrVersion = handleHelpOrVersion(ctx);
  if (helpOrVersion !== undefined) return helpOrVersion;
  const globalParseError = handleGlobalParseError(ctx);
  if (globalParseError !== undefined) return globalParseError;
  const completionsScript = handleCompletionsScript(ctx);
  if (completionsScript !== undefined) return completionsScript;
  const schemaManifestOrMcp = await handleSchemaManifestOrMcp(ctx);
  if (schemaManifestOrMcp !== undefined) return schemaManifestOrMcp;
  const unknownOption = handleUnknownOption(ctx);
  if (unknownOption !== undefined) return unknownOption;
  const nonRunnable = handleNonRunnableCommand(ctx);
  if (nonRunnable !== undefined) return nonRunnable;
  return runCommandInvocation(ctx);
};

export const serve = async (root: Cli, argv: string[], opts: ServeOptions): Promise<number> => {
  if (root.features.completions && argv[0] === "__complete") {
    const stdout = opts.stdout ?? ((s: string) => void process.stdout.write(s));
    const exit = opts.exit ?? defaultExit;
    let candidates: string[] = [];
    try {
      candidates = getCompletionCandidates(root, argv.slice(1));
    } catch {
      // completion must never break the shell; fall through with no candidates
    }
    if (candidates.length > 0) stdout(`${candidates.join("\n")}\n`);
    exit(0);
    return 0;
  }
  const ctx = createServeContext(root, argv, opts);
  const exitCodeBefore = process.exitCode;
  const code = await resolveExitCode(ctx);
  // surface a handler-set process.exitCode so forced-exit callers and tests see the failure
  const handlerCode = process.exitCode;
  const finalCode =
    code === 0 && typeof handlerCode === "number" && handlerCode !== 0 && handlerCode !== exitCodeBefore ?
      handlerCode
    : code;
  ctx.exit(finalCode);
  return finalCode;
};
