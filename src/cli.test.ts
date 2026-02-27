import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerPing } from "./commands/ping.js";
import { registerPr } from "./commands/pr/index.js";
import { registerStack } from "./commands/stack/index.js";
import { registerWorkspace } from "./commands/workspace/index.js";
import { cliArgs, runCli } from "./test-utils/cli.js";
import * as jjLib from "./lib/jj.js";

vi.mock("./lib/jj.js", async () => {
  const mod = await vi.importActual<typeof import("./lib/jj.js")>("./lib/jj.js");
  return { ...mod, jj: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) };
});
vi.mock("./lib/gh.js", () => ({ gh: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) }));
vi.mock("./commands/workspace/registry.js", () => ({
  rememberWorkspace: vi.fn().mockResolvedValue(undefined),
  lookupWorkspacePath: vi.fn().mockResolvedValue(undefined),
  forgetWorkspaceRecord: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("execa", () => ({ execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) }));

function buildProgram(): Command {
  const program = new Command();
  program
    .name("jj-scripts")
    .description("CLI for jj/jjui workflows")
    .version("0.1.0");
  registerPing(program);
  registerPr(program);
  registerStack(program);
  registerWorkspace(program);
  return program;
}

describe("CLI wiring", () => {
  it("registers ping and runs successfully", async () => {
    const program = buildProgram();
    const result = await runCli(program, cliArgs("ping"));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("pong");
  });

  it("registers stack integrate and runs with -r", async () => {
    const program = buildProgram();
    const result = await runCli(program, cliArgs("stack", "integrate", "-r", "@"));
    expect(result.exitCode).toBe(0);
    expect(jjLib.jj).toHaveBeenCalledWith(
      ["rebase", "-A", "trunk()", "-B", "merge", "-r", "@"],
    );
  });

  it("registers workspace and --help completes successfully", async () => {
    const program = buildProgram();
    const result = await runCli(program, cliArgs("workspace", "--help"));
    expect(result.exitCode).toBe(0);
  });
});
