import { afterEach, describe, expect, it, vi } from "vitest";
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
  return { ...mod, listWorkspaceNames: vi.fn() };
});

describe("workspace list", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("outputs jj workspace list by default", async () => {
    vi.mocked(jjLib.jjCapture).mockImplementation(async (args: string[]) => {
      if (args[0] === "root") return "/repo";
      if (args[0] === "workspace" && args[1] === "list") {
        return 'default: abc123 "desc"\nworkspace-foo: def456 (empty)\n';
      }
      return "";
    });

    const program = programWithWorkspace();
    const result = await runCli(program, cliArgs("workspace", "list"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("default:");
    expect(result.stdout).toContain("workspace-foo:");
  });

  it("outputs registry names only with --registry-only", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    vi.mocked(registryLib.listWorkspaceNames).mockResolvedValue([
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
      "workspace-a",
      "workspace-b",
    ]);
    expect(registryLib.listWorkspaceNames).toHaveBeenCalledWith("/repo");
  });

  it("outputs nothing with --registry-only when no workspaces", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("/repo");
    vi.mocked(registryLib.listWorkspaceNames).mockResolvedValue([]);

    const program = programWithWorkspace();
    const result = await runCli(
      program,
      cliArgs("workspace", "list", "--registry-only"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
