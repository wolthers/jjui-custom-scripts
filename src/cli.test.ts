import { describe, expect, it, vi } from "vitest";
import { cliArgs, programWithAll, runCli } from "./test-utils/cli.js";
import * as jjLib from "./lib/jj.js";

vi.mock("./lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("./lib/jj.js")>("./lib/jj.js");
  return { ...mod, jj: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) };
});
vi.mock("./lib/gh.js", () => ({
  gh: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));
vi.mock("./commands/workspace/registry.js", () => ({
  rememberWorkspace: vi.fn().mockResolvedValue(undefined),
  lookupWorkspacePath: vi.fn().mockResolvedValue(undefined),
  forgetWorkspaceRecord: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

describe("CLI wiring", () => {
  it("registers ping and runs successfully", async () => {
    const program = programWithAll();
    const result = await runCli(program, cliArgs("ping"));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("[ping] pong");
  });

  it("registers stack integrate and runs with -r", async () => {
    const program = programWithAll();
    const result = await runCli(
      program,
      cliArgs("stack", "integrate", "-r", "@"),
    );
    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith([
      "rebase",
      "-A",
      "trunk()",
      "-B",
      "merge",
      "-r",
      "@",
    ]);
  });

  it("registers workspace and --help completes successfully", async () => {
    const program = programWithAll();
    const result = await runCli(program, cliArgs("workspace", "--help"));
    expect(result.exitCode).toBe(0);
  });
});
