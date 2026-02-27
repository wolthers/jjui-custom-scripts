import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWorkspace } from "./index.js";
import { cliArgs, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as registryLib from "./registry.js";

vi.mock("../../lib/jj.js", async () => {
  const mod = await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jj: vi.fn(), jjCapture: vi.fn() };
});
vi.mock("execa", () => ({ execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) }));
vi.mock("./registry.js", () => ({ rememberWorkspace: vi.fn().mockResolvedValue(undefined) }));

describe("workspace add", () => {
  let repoRoot: string;
  let workspacePath: string;

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

  it("calls jj workspace add with destination and default sparse-patterns", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = join(repoRoot, "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    const result = await runCli(program, cliArgs(
      "workspace", "add", "ws1",
      "--skip-setup-agent", "--skip-task-agent",
    ));

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["workspace", "add", workspacePath, "--sparse-patterns", "copy"],
      { cwd: repoRoot },
    );
  });

  it("passes --name, -r, -m, --sparse-patterns to jj when provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = join(repoRoot, "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await runCli(program, cliArgs(
      "workspace", "add", "ws1",
      "--name", "my-ws",
      "-r", "main", "-r", "dev",
      "-m", "Initial workspace",
      "--sparse-patterns", "empty",
      "--skip-setup-agent", "--skip-task-agent",
    ));

    expect(jjLib.jj).toHaveBeenCalledWith(
      [
        "workspace", "add", workspacePath,
        "--name", "my-ws",
        "-r", "main", "-r", "dev",
        "-m", "Initial workspace",
        "--sparse-patterns", "empty",
      ],
      { cwd: repoRoot },
    );
  });

  it("calls rememberWorkspace with repoRoot, workspace name, and path", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = join(repoRoot, "ws1");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await runCli(program, cliArgs(
      "workspace", "add", "ws1", "--name", "my-ws",
      "--skip-setup-agent", "--skip-task-agent",
    ));

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith({
      repoRoot,
      workspace: "my-ws",
      path: workspacePath,
    });
  });

  it("uses destination basename as workspace name when --name not provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = join(repoRoot, "my-folder");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await runCli(program, cliArgs(
      "workspace", "add", "my-folder",
      "--skip-setup-agent", "--skip-task-agent",
    ));

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "my-folder" }),
    );
  });
});
