import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithWorkspace, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as registryLib from "./registry.js";
import { getSetupPrompt } from "./add.js";
import { execa } from "execa";

vi.mock("../../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jj: vi.fn(), jjCapture: vi.fn() };
});
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));
vi.mock("./registry.js", () => ({
  rememberWorkspace: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/prompt.js", () => ({
  promptLine: vi.fn().mockResolvedValue(""),
}));

describe("getSetupPrompt", () => {
  it("returns interactive prompt when tty is true (no non-interactive instruction)", () => {
    const prompt = getSetupPrompt(true);
    expect(prompt).not.toContain("non-interactive");
    expect(prompt).not.toContain("Do not ask the user questions");
    expect(prompt).toContain("Set up this fresh workspace for development.");
  });

  it("returns non-interactive prompt when tty is false (includes defaults instruction)", () => {
    const prompt = getSetupPrompt(false);
    expect(prompt).toContain("non-interactive");
    expect(prompt).toContain("Do not ask the user questions");
    expect(prompt).toContain("sensible defaults");
    expect(prompt).toContain("Set up this fresh workspace for development.");
  });
});

describe("workspace add", () => {
  let repoRoot: string;
  let workspacePath: string;
  let originalStdinTTY: boolean | undefined;

  afterEach(() => {
    if (originalStdinTTY !== undefined) {
      process.stdin.isTTY = originalStdinTTY;
    }
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
      const program = programWithWorkspace();
      const result = await runCli(
        program,
        cliArgs("workspace", "add", "--skip-setup-agent", "--skip-task-agent"),
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("destination required");
    } finally {
      process.stdin.isTTY = orig;
    }
  });

  it("calls jj workspace add with destination and default sparse-patterns", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs(
        "workspace",
        "add",
        "ws1",
        "--skip-setup-agent",
        "--skip-task-agent",
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      [
        "workspace",
        "add",
        workspacePath,
        "-r",
        "trunk()",
        "--sparse-patterns",
        "copy",
      ],
      { cwd: repoRoot },
    );
  });

  it("prepends --prefix to destination when provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "workspace-foo");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs(
        "workspace",
        "add",
        "foo",
        "--prefix",
        "workspace-",
        "--skip-setup-agent",
        "--skip-task-agent",
      ),
    );

    expect(jjLib.jj).toHaveBeenCalledWith(
      expect.arrayContaining(["workspace", "add", workspacePath]),
      { cwd: repoRoot },
    );
  });

  it("passes --name, -r, -m, --sparse-patterns to jj when provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs(
        "workspace",
        "add",
        "ws1",
        "--name",
        "my-ws",
        "-r",
        "main",
        "-r",
        "dev",
        "-m",
        "Initial workspace",
        "--sparse-patterns",
        "empty",
        "--skip-setup-agent",
        "--skip-task-agent",
      ),
    );

    expect(jjLib.jj).toHaveBeenCalledWith(
      [
        "workspace",
        "add",
        workspacePath,
        "--name",
        "my-ws",
        "-r",
        "main",
        "-r",
        "dev",
        "-m",
        "Initial workspace",
        "--sparse-patterns",
        "empty",
      ],
      { cwd: repoRoot },
    );
  });

  it("calls rememberWorkspace with repoRoot, workspace name, and path", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs(
        "workspace",
        "add",
        "ws1",
        "--name",
        "my-ws",
        "--skip-setup-agent",
        "--skip-task-agent",
      ),
    );

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith({
      repoRoot,
      workspace: "my-ws",
      path: workspacePath,
    });
  });

  it("uses destination basename as workspace name when --name not provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "my-folder");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs(
        "workspace",
        "add",
        "my-folder",
        "--skip-setup-agent",
        "--skip-task-agent",
      ),
    );

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "my-folder" }),
    );
  });

  it("passes non-interactive setup prompt to cursor agent when stdin is not a TTY", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    originalStdinTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs("workspace", "add", "ws1", "--skip-task-agent"),
    );

    const agentCalls = vi.mocked(execa).mock.calls.filter((call) => {
      const args = call[1] as string[] | undefined;
      return args?.includes("agent") && args?.includes("--workspace");
    });
    expect(agentCalls.length).toBeGreaterThanOrEqual(1);
    const args = agentCalls[0][1] as string[];
    const setupPrompt = args.at(-1) as string;
    expect(setupPrompt).toContain("non-interactive");
    expect(setupPrompt).toContain("Do not ask the user questions");
  });

  it("passes interactive setup prompt to cursor agent when stdin is a TTY", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    originalStdinTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;

    const program = programWithWorkspace();
    await runCli(
      program,
      cliArgs("workspace", "add", "ws1", "--skip-task-agent"),
    );

    const agentCalls = vi.mocked(execa).mock.calls.filter((call) => {
      const args = call[1] as string[] | undefined;
      return args?.includes("agent") && args?.includes("--workspace");
    });
    expect(agentCalls.length).toBeGreaterThanOrEqual(1);
    const args = agentCalls[0][1] as string[];
    const setupPrompt = args.at(-1) as string;
    expect(setupPrompt).not.toContain("non-interactive");
    expect(setupPrompt).not.toContain("Do not ask the user questions");
  });
});
