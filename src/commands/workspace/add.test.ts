import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithWorkspace, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as registryLib from "./registry.js";
import { isRelevantEnvFile } from "./add.js";

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

describe("isRelevantEnvFile", () => {
  it("matches .env", () => {
    expect(isRelevantEnvFile(".env")).toBe(true);
  });

  it("matches .env.local", () => {
    expect(isRelevantEnvFile(".env.local")).toBe(true);
  });

  it("matches .env.production", () => {
    expect(isRelevantEnvFile(".env.production")).toBe(true);
  });

  it("excludes .env.example", () => {
    expect(isRelevantEnvFile(".env.example")).toBe(false);
  });

  it("excludes .env.sample", () => {
    expect(isRelevantEnvFile(".env.sample")).toBe(false);
  });

  it("excludes .env.template", () => {
    expect(isRelevantEnvFile(".env.template")).toBe(false);
  });

  it("rejects non-env files", () => {
    expect(isRelevantEnvFile("package.json")).toBe(false);
    expect(isRelevantEnvFile(".gitignore")).toBe(false);
    expect(isRelevantEnvFile("env")).toBe(false);
  });
});

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

  it("exits with error when destination missing and stdin is not a TTY", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    const orig = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const program = programWithWorkspace();
      const result = await runCli(program, cliArgs("workspace", "add"));
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
    const result = await runCli(program, cliArgs("workspace", "add", "ws1"));

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
      cliArgs("workspace", "add", "foo", "--prefix", "workspace-"),
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
      cliArgs("workspace", "add", "ws1", "--name", "my-ws"),
    );

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith({
      repoRoot,
      workspace: "my-ws",
      path: workspacePath,
      bookmark: "ws1",
    });
  });

  it("uses destination basename as workspace name when --name not provided", async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-repo-"));
    workspacePath = resolve(dirname(repoRoot), "my-folder");
    mkdirSync(workspacePath, { recursive: true });
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithWorkspace();
    await runCli(program, cliArgs("workspace", "add", "my-folder"));

    expect(registryLib.rememberWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "my-folder" }),
    );
  });
});
