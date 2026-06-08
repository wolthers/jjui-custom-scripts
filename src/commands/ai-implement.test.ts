import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithAiImplement, runCli } from "../test-utils/cli.js";
import * as jjLib from "../lib/jj.js";

vi.mock("../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../lib/jj.js")>("../lib/jj.js");
  return { ...mod, jj: vi.fn(), jjCapture: vi.fn() };
});
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));
vi.mock("./workspace/registry.js", () => ({
  rememberWorkspace: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/prompt.js", () => ({
  promptLine: vi.fn().mockResolvedValue(""),
}));
vi.mock("../lib/agent.js", () => ({
  runInteractiveAgent: vi.fn().mockResolvedValue(undefined),
  resolveAgentCommand: vi
    .fn()
    .mockResolvedValue({ argv: ["agent"], isCursorCli: true }),
}));

describe("ai-implement", () => {
  let repoRoot: string;

  afterEach(() => {
    vi.clearAllMocks();
    if (repoRoot) {
      try {
        rmSync(repoRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("exits with error when destination missing and stdin is not a TTY", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    const orig = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const program = programWithAiImplement();
      const result = await runCli(program, cliArgs("ai-implement"));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("destination required");
    } finally {
      process.stdin.isTTY = orig;
    }
  });

  it("creates workspace and launches agent when destination is provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    const workspacePath = resolve(dirname(repoRoot), "ws-ai");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const agentLib = await import("../lib/agent.js");

    const program = programWithAiImplement();
    const result = await runCli(program, cliArgs("ai-implement", "ws-ai"));

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      expect.arrayContaining(["workspace", "add", workspacePath]),
      { cwd: repoRoot },
    );
    expect(agentLib.runInteractiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: workspacePath, plan: true }),
    );
  });

  it("passes --skip-setup-prompt to omit setup prompt from agent", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    const workspacePath = resolve(dirname(repoRoot), "ws-skip");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const agentLib = await import("../lib/agent.js");

    const program = programWithAiImplement();
    await runCli(
      program,
      cliArgs("ai-implement", "ws-skip", "--skip-setup-prompt"),
    );

    const call = vi.mocked(agentLib.runInteractiveAgent).mock.calls[0][0];
    expect(call.initialPrompt).toBeUndefined();
  });

  it("prepends --prefix to destination when provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    const workspacePath = resolve(dirname(repoRoot), "workspace-foo");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithAiImplement();
    await runCli(
      program,
      cliArgs("ai-implement", "foo", "--prefix", "workspace-"),
    );

    expect(jjLib.jj).toHaveBeenCalledWith(
      expect.arrayContaining(["workspace", "add", workspacePath]),
      { cwd: repoRoot },
    );
  });
});
