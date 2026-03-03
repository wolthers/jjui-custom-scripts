import { afterEach, describe, expect, it, vi } from "vitest";
import * as jjLib from "../../lib/jj.js";
import { buildBranchGraph, graphToDot } from "./graph.js";

vi.mock("../../lib/jj.js", async () => {
  const mod =
    await vi.importActual<typeof import("../../lib/jj.js")>("../../lib/jj.js");
  return { ...mod, jjCapture: vi.fn() };
});

describe("graphToDot", () => {
  it("emits digraph with edges and labels", () => {
    const graph = new Map<string, string[]>([
      ["main", ["feature-a", "feature-b"]],
      ["feature-a", ["feature-a-1"]],
    ]);
    const dot = graphToDot(graph);
    expect(dot).toContain("digraph Branches {");
    expect(dot).toContain('"main" -> "feature-a";');
    expect(dot).toContain('"main" -> "feature-b";');
    expect(dot).toContain('"feature-a" -> "feature-a-1";');
    expect(dot).toContain('"main" [label="main"]');
    expect(dot).toContain('"feature-a" [label="feature-a"]');
    expect(dot).toContain("}");
  });

  it("emits valid DOT for empty graph", () => {
    const graph = new Map<string, string[]>();
    const dot = graphToDot(graph);
    expect(dot).toBe("digraph Branches {\n}");
  });

  it("escapes quotes in branch names", () => {
    const graph = new Map<string, string[]>([["main", ['branch"quote']]]);
    const dot = graphToDot(graph);
    expect(dot).toContain('"branch\\"quote"');
  });
});

describe("buildBranchGraph", () => {
  const cwd = "/fake/cwd";

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty graph when root has no children with bookmarks", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockResolvedValueOnce("abc123\n")
      .mockResolvedValueOnce("");

    const graph = await buildBranchGraph("main", cwd);

    expect(graph.size).toBe(0);
    expect(jjLib.jjCapture).toHaveBeenNthCalledWith(
      1,
      ["log", "-r", "main", "-T", "change_id", "--no-graph"],
      { cwd },
    );
    const childrenTemplate = 'change_id ++ " " ++ local_bookmarks ++ "\n"';
    expect(jjLib.jjCapture).toHaveBeenNthCalledWith(
      2,
      [
        "log",
        "-r",
        "children(abc123, 1)",
        "-T",
        childrenTemplate,
        "--no-graph",
      ],
      { cwd },
    );
  });

  it("builds parent->children from root and one level of children", async () => {
    vi.mocked(jjLib.jjCapture)
      .mockResolvedValueOnce("rootRev\n")
      .mockResolvedValueOnce("childRev1 feature-a*\nchildRev2 feature-b\n")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("");

    const graph = await buildBranchGraph("main", cwd);

    expect(graph.get("main")).toEqual(["feature-a", "feature-b"]);
    expect(graph.size).toBe(1);
    expect(jjLib.jjCapture).toHaveBeenNthCalledWith(
      1,
      ["log", "-r", "main", "-T", "change_id", "--no-graph"],
      { cwd },
    );
    const childrenTemplate = 'change_id ++ " " ++ local_bookmarks ++ "\n"';
    expect(jjLib.jjCapture).toHaveBeenNthCalledWith(
      2,
      [
        "log",
        "-r",
        "children(rootRev, 1)",
        "-T",
        childrenTemplate,
        "--no-graph",
      ],
      { cwd },
    );
  });

  it("throws when root branch rev cannot be resolved", async () => {
    vi.mocked(jjLib.jjCapture).mockResolvedValueOnce("");

    await expect(buildBranchGraph("main", cwd)).rejects.toThrow(
      "Could not resolve rev for branch main",
    );
  });
});
