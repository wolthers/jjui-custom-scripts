import { describe, expect, it } from "vitest";
import { cliArgs, programWithPing, runCli } from "../test-utils/cli.js";

describe("ping", () => {
  it("emits pong and exits 0", async () => {
    const program = programWithPing();
    const result = await runCli(program, cliArgs("ping"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("pong");
    expect(result.stderr).toBe("");
  });
});
