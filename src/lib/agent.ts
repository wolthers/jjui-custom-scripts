import { execa } from "execa";

const AGENT_CMD_ENV = "JJ_SCRIPTS_AGENT_CMD";

type ResolvedAgent = {
  argv: string[];
  isCursorCli: boolean;
};

/**
 * Resolve the agent command.
 * Order: JJ_SCRIPTS_AGENT_CMD > "agent" (Cursor CLI) > "cursor agent".
 * Returns null if no agent command is available.
 */
export async function resolveAgentCommand(): Promise<ResolvedAgent | null> {
  const override = process.env[AGENT_CMD_ENV]?.trim();
  if (override) {
    const argv = override.split(/\s+/).filter(Boolean);
    if (argv.length > 0) return { argv, isCursorCli: false };
  }

  try {
    await execa("agent", ["--version"], { reject: false });
    return { argv: ["agent"], isCursorCli: true };
  } catch {
    // agent not in PATH, try cursor
  }

  try {
    await execa("cursor", ["agent", "--version"], { reject: false });
    return { argv: ["cursor", "agent"], isCursorCli: true };
  } catch {
    return null;
  }
}

export type RunInteractiveAgentOptions = {
  cwd: string;
  initialPrompt?: string | undefined;
  plan?: boolean;
};

/**
 * Run the agent in interactive mode in the foreground (stdio inherited).
 * Blocks until the agent exits. Use when the terminal is "owned" by the agent.
 */
export async function runInteractiveAgent(
  options: RunInteractiveAgentOptions,
): Promise<void> {
  const resolved = await resolveAgentCommand();
  if (!resolved) {
    throw new Error(
      'No agent command found. Set JJ_SCRIPTS_AGENT_CMD (e.g. "cursor agent" or "agent") or install the Cursor CLI.',
    );
  }

  const { argv, isCursorCli } = resolved;
  const args = argv.slice(1);
  if (isCursorCli && options.plan) {
    args.push("--plan");
  }
  if (options.initialPrompt?.trim()) {
    args.push(options.initialPrompt.trim());
  }

  await execa(argv[0], args, {
    cwd: options.cwd,
    stdio: "inherit",
  });
}

export type RunPrintAgentOptions = {
  cwd: string;
  prompt: string;
  timeoutMs?: number;
};

/**
 * Run the agent in non-interactive (print) mode and return stdout.
 * For Cursor CLI, uses --print --trust --mode ask --output-format text.
 * For custom agents (JJ_SCRIPTS_AGENT_CMD), passes the prompt as the only argument.
 * Returns null if no agent is available or the agent returns empty.
 */
export async function runPrintAgent(
  options: RunPrintAgentOptions,
): Promise<string | null> {
  const resolved = await resolveAgentCommand();
  if (!resolved) return null;

  const { argv, isCursorCli } = resolved;
  const timeoutMs = options.timeoutMs ?? 60_000 * 5; // 5 minutes

  const args = isCursorCli
    ? [
        ...argv.slice(1),
        "--print",
        "--trust",
        "--mode",
        "ask",
        "--output-format",
        "text",
        options.prompt,
      ]
    : [...argv.slice(1), options.prompt];

  try {
    const result = await execa(argv[0], args, {
      cwd: options.cwd,
      timeout: timeoutMs,
    });
    const output = result.stdout?.trim() ?? "";
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
