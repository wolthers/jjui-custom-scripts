import { jjCapture } from "../../lib/jj.js";

/**
 * Build branch stack graph from root branch tip only (no history older than main).
 * Returns adjacency list: parent branch -> list of child branch names.
 * Only descendants of the current root tip are included.
 */
export async function buildBranchGraph(
  rootBranch: string,
  cwd: string,
): Promise<Map<string, string[]>> {
  const rootRevOutput = await jjCapture(
    ["log", "-r", rootBranch, "-T", "change_id", "--no-graph"],
    { cwd },
  );
  const rootRev = rootRevOutput.trim().split(/\r?\n/)[0]?.trim();
  if (!rootRev) {
    throw new Error(`Could not resolve rev for branch ${rootBranch}`);
  }

  const graph = new Map<string, string[]>();

  function ensureParent(parent: string): void {
    if (!graph.has(parent)) {
      graph.set(parent, []);
    }
  }

  async function go(changeId: string, parentBranch: string): Promise<void> {
    let output: string;
    try {
      output = await jjCapture(
        [
          "log",
          "-r",
          `children(${changeId}, 1)`,
          "-T",
          'change_id ++ " " ++ local_bookmarks ++ "\n"',
          "--no-graph",
        ],
        { cwd },
      );
    } catch {
      return;
    }

    const lines = output
      .trim()
      .split(/\r?\n/)
      .filter((s) => s.length > 0);
    const childPromises: Promise<void>[] = [];
    for (const line of lines) {
      const spaceIndex = line.indexOf(" ");
      const childChangeId =
        spaceIndex >= 0 ? line.slice(0, spaceIndex).trim() : line.trim();
      const bookmarksStr =
        spaceIndex >= 0 ? line.slice(spaceIndex + 1).trim() : "";
      const bookmark = bookmarksStr.replace(/\*$/, "").trim();

      if (childChangeId.length === 0) {
        continue;
      }

      if (bookmark.length > 0 && bookmark !== parentBranch) {
        ensureParent(parentBranch);
        const children = graph.get(parentBranch)!;
        if (!children.includes(bookmark)) {
          children.push(bookmark);
        }
        childPromises.push(go(childChangeId, bookmark));
      } else {
        childPromises.push(go(childChangeId, parentBranch));
      }
    }
    await Promise.all(childPromises);
  }

  await go(rootRev, rootBranch);
  return graph;
}

/**
 * Emit DOT for the branch graph (for use with `dot -Tpng`).
 */
export function graphToDot(graph: Map<string, string[]>): string {
  const lines: string[] = ["digraph Branches {"];
  const seen = new Set<string>();
  for (const [parent, children] of graph) {
    for (const child of children) {
      const from = parent.replace(/"/g, '\\"');
      const to = child.replace(/"/g, '\\"');
      lines.push(`  "${from}" -> "${to}";`);
      seen.add(parent);
      seen.add(child);
    }
  }
  for (const node of seen) {
    const label = node.replace(/"/g, '\\"');
    lines.push(`  "${label}" [label="${label}"];`);
  }
  lines.push("}");
  return lines.join("\n");
}
