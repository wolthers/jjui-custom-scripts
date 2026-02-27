import { Command } from "commander";
import { registerPing } from "../commands/ping.js";
import { registerPr } from "../commands/pr/index.js";
import { registerStack } from "../commands/stack/index.js";
import { registerWorkspace } from "../commands/workspace/index.js";

const EXIT_INTERCEPT_CODE = "cli_test_exit";

/**
 * Minimal program with name "jj-scripts" for tests that need to register commands themselves.
 */
export function createProgram(): Command {
  const program = new Command();
  program.name("jj-scripts");
  return program;
}

/**
 * Program with only the stack group registered (integrate, restack). Use in stack command tests.
 */
export function programWithStack(): Command {
  const program = createProgram();
  registerStack(program);
  return program;
}

/**
 * Program with only the pr group registered. Use in pr command tests.
 */
export function programWithPr(): Command {
  const program = createProgram();
  registerPr(program);
  return program;
}

/**
 * Program with only the workspace group registered. Use in workspace command tests.
 */
export function programWithWorkspace(): Command {
  const program = createProgram();
  registerWorkspace(program);
  return program;
}

/**
 * Program with only the ping command registered. Use in ping tests.
 */
export function programWithPing(): Command {
  const program = createProgram();
  registerPing(program);
  return program;
}

/**
 * Full program with all command groups (mirrors cli.ts). Use for integration/wiring tests.
 */
export function programWithAll(): Command {
  const program = createProgram();
  registerPing(program);
  registerPr(program);
  registerStack(program);
  registerWorkspace(program);
  return program;
}

class ExitIntercept extends Error {
  constructor(public readonly code: number) {
    super(EXIT_INTERCEPT_CODE);
    this.name = "ExitIntercept";
  }
}

/**
 * Run a Commander program with the given argv and capture stdout, stderr, and exit code.
 * Use this to test CLI contract: flags, defaults, and exit behavior without leaving the process.
 */
export async function runCli(
  program: Command,
  argv: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origExit = process.exit;

  console.log = (...args: unknown[]) => {
    stdoutChunks.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderrChunks.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    stderrChunks.push(args.map(String).join(" "));
  };
  process.exit = ((code?: number) => {
    throw new ExitIntercept(code === undefined ? 0 : code);
  }) as typeof process.exit;

  let exitCode = 0;
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    if (err instanceof ExitIntercept) {
      exitCode = err.code;
    } else {
      throw err;
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
    process.exit = origExit;
  }

  return {
    stdout: stdoutChunks.join("\n"),
    stderr: stderrChunks.join("\n"),
    exitCode,
  };
}

/**
 * Build argv for Commander: just the command and options (Commander treats first element as the top-level command, e.g. "ping" or "stack").
 */
export function cliArgs(...parts: string[]): string[] {
  return [...parts];
}
