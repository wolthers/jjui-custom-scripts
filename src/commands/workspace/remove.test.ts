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
vi.mock("./registry.js", () => ({
  lookupWorkspacePath: vi.fn(),
  forgetWorkspaceRecord: vi.fn().mockResolvedValue(undefined),
}));

describe("workspace remove", () => {
  const repoRoot = "/tmp/repo";

  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(registryLib.forgetWorkspaceRecord).mockResolvedValue(undefined);
  });

  it("calls jj workspace forget and forgetWorkspaceRecord", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    const result = await runCli(program, cliArgs("workspace", "remove", "my-ws", "--keep-files"));

    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["workspace", "forget", "my-ws"],
      { cwd: repoRoot },
    );
    expect(registryLib.forgetWorkspaceRecord).toHaveBeenCalledWith(repoRoot, "my-ws");
  });

  it("uses --path when provided", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(undefined);

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await runCli(program, cliArgs("workspace", "remove", "my-ws", "--path", "/custom/path", "--keep-files"));

    expect(registryLib.lookupWorkspacePath).not.toHaveBeenCalled();
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["workspace", "forget", "my-ws"],
      { cwd: repoRoot },
    );
  });

  it("looks up path from registry when --path not provided", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue("/tmp/repo/ws1");

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await runCli(program, cliArgs("workspace", "remove", "my-ws", "--keep-files"));

    expect(registryLib.lookupWorkspacePath).toHaveBeenCalledWith(repoRoot, "my-ws");
  });

  it("throws when target is repo root (unsafe delete)", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue(repoRoot);
    vi.mocked(jjLib.jj).mockResolvedValue({ stdout: "", stderr: "" });
    vi.mocked(registryLib.lookupWorkspacePath).mockResolvedValue(repoRoot);

    const program = new Command();
    program.name("jj-scripts");
    registerWorkspace(program);
    await expect(
      runCli(program, cliArgs("workspace", "remove", "my-ws")),
    ).rejects.toThrow(/Refusing to delete unsafe path/);
  });
});
