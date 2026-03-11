import { afterEach, describe, expect, it, vi } from "vitest";
import { cliArgs, programWithPr, runCli } from "../../test-utils/cli.js";
import * as jjLib from "../../lib/jj.js";
import * as ghLib from "../../lib/gh.js";
import { EXIT_GH, EXIT_NO_BOOKMARK } from "../../lib/errors.js";

vi.mock("../../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jj: vi.fn(), jjCapture: vi.fn() };
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

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith([
      "pr",
      "view",
      "feature-branch",
      "--web",
    ]);
  });

  it("exits EXIT_NO_BOOKMARK when no bookmark and no (#number) in description", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("");

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(EXIT_NO_BOOKMARK);
    expect(result.stderr).toContain("No bookmark found");
  });

  it("opens PR by (#number) from description when no bookmark exists (e.g. main@origin)", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockResolvedValueOnce("") // resolveBookmark: bookmark list returns empty
      .mockResolvedValueOnce(
        "NG-3978 · Regression: 'Confirm' button missing (#1301)\n",
      ); // getChangeDescription
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith(["pr", "view", "1301", "--web"]);
  });

  it("exits EXIT_GH when bookmark exists but no PR found", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockRejectedValue(
      new Error("no pull requests found for head"),
    );

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(EXIT_GH);
    expect(result.stderr).toContain("No PR found");
  });

  it("opens PR by (#number) from change description when bookmark has no PR", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockResolvedValueOnce("some-branch\n")
      .mockResolvedValueOnce(
        "Move notes/tasks back to sidebar (#1271)\n\nBody here\n",
      );
    vi.mocked(ghLib.gh)
      .mockRejectedValueOnce(new Error("no pull requests found for head"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "view", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledTimes(2);
    expect(ghLib.gh).toHaveBeenNthCalledWith(1, [
      "pr",
      "view",
      "some-branch",
      "--web",
    ]);
    expect(ghLib.gh).toHaveBeenNthCalledWith(2, [
      "pr",
      "view",
      "1271",
      "--web",
    ]);
  });
});

describe("pr create", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits 0 when PR already exists (opens it)", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValue("feature-branch\n");
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "", stderr: "" });

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "create", "-c", "@"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith([
      "pr",
      "view",
      "feature-branch",
      "--web",
    ]);
  });
});

describe("pr graph", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prints DOT when no --out and graph is empty", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockRejectedValueOnce(new Error("no dev"))
      .mockResolvedValueOnce("rootRev\n")
      .mockResolvedValueOnce("");

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "graph"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("digraph Branches");
    expect(result.stdout).toContain("}");
  });

  it("prints DOT with edges when root has children", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockRejectedValueOnce(new Error("no dev"))
      .mockResolvedValueOnce("rootRev\n")
      .mockResolvedValueOnce("c1 feature-a\n")
      .mockResolvedValueOnce("");

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "graph"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"main" -> "feature-a"');
  });
});

describe("pr sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exits 1 when stdin is not a TTY and --yes not passed", async () => {
    const orig = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const program = programWithPr();
      const result = await runCli(program, cliArgs("pr", "sync"));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("requires a TTY");
      expect(result.stderr).toContain("--yes");
    } finally {
      process.stdin.isTTY = orig;
    }
  });

  it("exits 0 with --yes when graph is empty and no open PRs", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockRejectedValueOnce(new Error("no dev"))
      .mockResolvedValueOnce("rootRev\n")
      .mockResolvedValueOnce("");
    vi.mocked(ghLib.gh).mockResolvedValue({ stdout: "[]", stderr: "" });

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "sync", "--yes"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith(
      [
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,headRefName,baseRefName,body,url",
      ],
      expect.anything(),
    );
  });

  it("updates PR base when branch has PR with wrong base", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockRejectedValueOnce(new Error("no dev"))
      .mockResolvedValueOnce("rootRev\n")
      .mockResolvedValueOnce("c1 feature-a\n")
      .mockResolvedValueOnce("");
    const prList = [
      {
        number: 42,
        headRefName: "feature-a",
        baseRefName: "dev",
        body: "",
        url: "https://github.com/o/r/pull/42",
      },
    ];
    vi.mocked(ghLib.gh)
      .mockResolvedValueOnce({
        stdout: JSON.stringify(prList),
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // pr edit --base
      .mockResolvedValueOnce({ stdout: '{"body": ""}', stderr: "" }) // pr view --json body
      .mockResolvedValueOnce({ stdout: "", stderr: "" }); // pr edit --body-file

    const program = programWithPr();
    const result = await runCli(program, cliArgs("pr", "sync", "--yes"));

    expect(result.exitCode).toBe(0);
    expect(ghLib.gh).toHaveBeenCalledWith(
      ["pr", "edit", "42", "--base", "main"],
      expect.anything(),
    );
  });
});
