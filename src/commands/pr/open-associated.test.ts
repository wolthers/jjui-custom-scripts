import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPr } from "./index.js";
import { cliArgs, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as ghLib from "../../lib/gh.js";
import { EXIT_GH, EXIT_NO_BOOKMARK } from "../../lib/errors.js";

vi.mock("../../lib/jj.js", async () => {
  const mod = await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jjCapture: vi.fn() };
});
vi.mock("../../lib/gh.js", () => ({
  gh: vi.fn(),
}));

describe("pr view", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits 0 when bookmark resolved and gh pr view succeeds", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerPr(program);
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith(["pr", "view", "feature-branch", "--web"]);
  });

  it("exits EXIT_NO_BOOKMARK when no bookmark for change", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("");

    const program = new Command();
    program.name("jj-scripts");
    registerPr(program);
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(EXIT_NO_BOOKMARK);
    expect(result.stderr).toContain("No bookmark found");
  });

  it("exits EXIT_GH when bookmark exists but no PR found", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockRejectedValue(new Error("no pull requests found for head"));

    const program = new Command();
    program.name("jj-scripts");
    registerPr(program);
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(EXIT_GH);
    expect(result.stderr).toContain("No PR found");
  });
});

describe("pr create", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits 0 when PR already exists (opens it)", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerPr(program);
    const result = await runCli(program, cliArgs("pr", "create", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith(["pr", "view", "feature-branch", "--web"]);
  });
});

describe("pr view-or-create", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits 0 when PR already exists", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "", stderr: "" });

    const program = new Command();
    program.name("jj-scripts");
    registerPr(program);
    const result = await runCli(program, cliArgs("pr", "view-or-create", "-c", "@"));

    expect(result.exitCode).toBe(0);
  });
});
