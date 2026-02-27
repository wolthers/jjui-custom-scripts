import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerPing } from "./ping.js";
import { cliArgs, runCli } from "../test-utils/cli.js";

describe("ping", () => {
  it("emits pong and exits 0", async () => {
    const program = new Command();
    program.name("jj-scripts");
    registerPing(program);

    const result = await runCli(program, cliArgs("ping"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("pong");
    expect(result.stderr).toBe("");
  });
});
