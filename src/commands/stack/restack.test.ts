import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, runCli } from "../../test-utils/cli.js";
import { registerRestack } from "./restack.js";
import * as jjLib from "../../lib/jj.js";

vi.mock("../../lib/jj.js", () => ({
  jj: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

describe("stack restack", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls jj simplify-parents then rebase with expected args", async () => {
    const program = new Command();
    program.name("jj-scripts");
    const stack = program.command("stack");
    registerRestack(stack);

    const result = await runCli(program, cliArgs("stack", "restack"));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(jjLib.jj)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(jjLib.jj)).toHaveBeenNthCalledWith(1, ["simplify-parents"]);
    expect(vi.mocked(jjLib.jj)).toHaveBeenNthCalledWith(2, [
      "rebase",
      "-s",
      "roots(trunk()..) & mutable()",
      "-o",
      "trunk()",
    ]);
  });
});
