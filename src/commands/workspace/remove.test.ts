import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithWorkspace, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as registryLib from "./registry.js";

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return { ...actual, rm: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jj: vi.fn(), jjCapture: vi.fn() };
});
vi.mock("./registry.js", () => ({
  lookupWorkspacePath: vi.fn(),
  forgetWorkspaceRecord: vi.fn().mockResolvedValue(undefined),
  listWorkspaceNames: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/prompt.js", () => ({
  promptLine: vi.fn().mockResolvedValue(""),
}));

describe("workspace remove", () => {
  const repoRoot = "/tmp/repo";

  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(registryLib.forgetWorkspaceRecord).mockResolvedValue(undefined);
  });

  it("exits with error when name missing and stdin is not a TTY", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    const orig = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const program = programWithWorkspace();
      const result = await runCli(
        program,
        cliArgs("workspace", "remove", "--keep-files"),
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("name required");
    } finally {
      process.stdin.isTTY = orig;
    }
  });

  it("calls jj workspace forget and forgetWorkspaceRecord", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--keep-files"),
    );

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(["workspace", "forget", "my-ws"], {
      cwd: repoRoot,
    });
    expect(registryLib.forgetWorkspaceRecord).toHaveBeenCalledWith(
      repoRoot,
      "my-ws",
    );
  });

  it("uses --path when provided and path is inside workspace root", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs(
        "workspace",
        "remove",
        "my-ws",
        "--path",
        "/tmp/workspace-foo",
        "--keep-files",
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(registryLib.lookupWorkspacePath).not.toHaveBeenCalled();
    expect(jjLib.jj).toHaveBeenCalledWith(["workspace", "forget", "my-ws"], {
      cwd: repoRoot,
    });
  });

  it("refuses delete when --path is outside workspace root", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--path", "/custom/path"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("outside workspace root");
  });

  it("looks up path from registry when --path not provided", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(
      "/tmp/repo/ws1",
    );

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--keep-files"),
    );

    expect(result.exitCode).toBe(0);
    expect(registryLib.lookupWorkspacePath).toHaveBeenCalledWith(
      repoRoot,
      "my-ws",
    );
  });

  it("exits 1 when target is repo root (unsafe delete)", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(repoRoot);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Refusing to delete");
    expect(result.stderr).toContain("root or repo");
  });

  it("allows delete when path is inside workspace root", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(
      "/tmp/workspace-foo",
    );

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--keep-files"),
    );

    expect(result.exitCode).toBe(0);
  });

  it("warns when folder name does not start with workspace-", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue("/tmp/my-ws");

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("does not start with 'workspace-'");
  });
});
