import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithWorkspace, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as promptLib from "../../lib/prompt.js";
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

  const mockJjCapture = (
    overrides?: Partial<{
      root: string;
      currentWorkspace: string;
      workspaceList: string;
      workspaceRoot: string;
    }>,
  ) => {
    const root = overrides?.root ?? repoRoot;
    const currentWorkspace = overrides?.currentWorkspace ?? "default";
    const workspaceList =
      overrides?.workspaceList ??
      ["default", "my-ws"].map((n) => `${n}\n`).join("");
    const workspaceRoot = overrides?.workspaceRoot ?? "";
    vi.mocked(jjLib.jjCapture).mockImplementation(async (args: string[]) => {
      if (args[0] === "root") return root;
      if (args[0] === "log") return `${currentWorkspace}@`;
      if (args[0] === "workspace" && args[1] === "list") return workspaceList;
      if (args[0] === "workspace" && args[1] === "root") return workspaceRoot;
      return "";
    });
  };

  it("exits with error when name missing and stdin is not a TTY", async () => {
    mockJjCapture();
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
    mockJjCapture({ workspaceRoot: "" });
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--keep-files"),
    );

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["workspace", "forget", "--", "my-ws"],
      {
        cwd: repoRoot,
      },
    );
    expect(registryLib.forgetWorkspaceRecord).toHaveBeenCalledWith(
      repoRoot,
      "my-ws",
    );
  });

  it("uses --path when provided and path is inside workspace root", async () => {
    mockJjCapture();
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
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["workspace", "forget", "--", "my-ws"],
      {
        cwd: repoRoot,
      },
    );
  });

  it("refuses delete when --path is outside workspace root", async () => {
    mockJjCapture();
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
    mockJjCapture();
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
    mockJjCapture();
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
    mockJjCapture();
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
    mockJjCapture();
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

  it("refuses to remove the current workspace", async () => {
    mockJjCapture({ currentWorkspace: "my-ws" });
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "remove", "my-ws", "--keep-files"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Refusing to remove current workspace");
  });

  it("can forget a workspace named --help", async () => {
    mockJjCapture({
      currentWorkspace: "default",
      workspaceList: "\"--help\"\ndefault\n",
      workspaceRoot: "",
    });
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);
    vi.mocked(promptLib.promptLine).mockResolvedValue("--help");

    const orig = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const program = programWithWorkspace();
    try {
      const result = await runCli(program, cliArgs("workspace", "remove", "--keep-files"));

      expect(result.exitCode).toBe(0);
      expect(jjLib.jj).toHaveBeenCalledWith(
        ["workspace", "forget", "--", "--help"],
        { cwd: repoRoot },
      );
    } finally {
      process.stdin.isTTY = orig;
    }
  });
});
