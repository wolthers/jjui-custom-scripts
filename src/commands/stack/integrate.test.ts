import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, runCli } from "../../test-utils/cli.js";
import { registerIntegrate } from "./integrate.js";
import * as jjLib from "../../lib/jj.js";

vi.mock("../../lib/jj.js", () => ({
  jj: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

describe("stack integrate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls jj with revision from -r", async () => {
    const program = new Command();
    program.name("jj-scripts");
    const stack = program.command("stack");
    registerIntegrate(stack);

    const result = await runCli(program, cliArgs("stack", "integrate", "-r", "main"));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(jjLib.jj)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jjLib.jj)).toHaveBeenCalledWith(
      ["rebase", "-A", "trunk()", "-B", "merge", "-r", "main"],
    );
  });

  it("calls jj with revision from --revision", async () => {
    const program = new Command();
    program.name("jj-scripts");
    const stack = program.command("stack");
    registerIntegrate(stack);

    await runCli(program, cliArgs("stack", "integrate", "--revision", "@"));

    expect(vi.mocked(jjLib.jj)).toHaveBeenCalledWith(
      ["rebase", "-A", "trunk()", "-B", "merge", "-r", "@"],
    );
  });
});
