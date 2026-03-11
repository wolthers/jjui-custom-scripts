import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_EMPTY } from "../../lib/errors.js";
import { cliArgs, programWithWorkspace, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as registryLib from "./registry.js";

vi.mock("../../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jjCapture: vi.fn() };
});
vi.mock("./registry.js", async () => {
  const mod =
    await vi.importActual<typeof import("./registry.js")>("./registry.js");
  return { ...mod, listRegistryWorkspaceNames: vi.fn() };
});

describe("workspace list", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits with message when jj has no workspaces", async () => {
    vi.mocked(jjLib.jjCapture).mockImplementation(async (args: string[]) => {
      if (args[0] === "root") return "/repo";
      return "";
    });
    vi.mocked(registryLib.listRegistryWorkspaceNames).mockResolvedValue([]);

    const program = programWithWorkspace();
    const result = await runCli(program, cliArgs("workspace", "list"));

    expect(result.exitCode).toBe(EXIT_EMPTY);
    expect(result.stderr).toContain(
      "No workspaces. Use 'workspace add' to create one.",
    );
  });

  it("outputs jj workspace list when registry has workspaces", async () => {
    vi.mocked(jjLib.jjCapture).mockImplementation(async (args: string[]) => {
      if (args[0] === "root") return "/repo";
      if (args[0] === "workspace" && args[1] === "list") {
        return 'default: abc123 "desc"\nworkspace-foo: def456 (empty)\n';
      }
      return "";
    });
    vi.mocked(registryLib.listRegistryWorkspaceNames).mockResolvedValue([
      "workspace-foo",
    ]);

    const program = programWithWorkspace();
    const result = await runCli(program, cliArgs("workspace", "list"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("default:");
    expect(result.stdout).toContain("workspace-foo:");
  });

  it("outputs registry names only with --registry-only", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    vi.mocked(registryLib.listRegistryWorkspaceNames).mockResolvedValue([
      "workspace-a",
      "workspace-b",
    ]);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "list", "--registry-only"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "[workspace list] Listing workspaces...",
      "workspace-a",
      "workspace-b",
    ]);
    expect(registryLib.listRegistryWorkspaceNames).toHaveBeenCalledWith(
      "/repo",
    );
  });

  it("exits with message when --registry-only and no workspaces", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    vi.mocked(registryLib.listRegistryWorkspaceNames).mockResolvedValue([]);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "list", "--registry-only"),
    );

    expect(result.exitCode).toBe(EXIT_EMPTY);
    expect(result.stderr).toContain("No workspaces in registry.");
    expect(result.stdout).toContain("[workspace list] Listing workspaces...");
  });
});
