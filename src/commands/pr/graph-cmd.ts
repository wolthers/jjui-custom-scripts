import { execa } from "execa";
import type { Command } from "commander";
import { resolveBaseBranch } from "./common.js";
import { buildBranchGraph, graphToDot } from "./graph.js";

export function registerGraph(pr: Command): void {
  pr.command("graph")
    .description(
      "Build branch stack graph from current main (or dev) and output DOT; optionally render to PNG",
    )
    .option("-o, --out <path>", "Write PNG to path (requires `dot` on PATH)")
    .action(async (opts: { out?: string }) => {
      const cwd = process.cwd();
      const root = await resolveBaseBranch(cwd);
      const graph = await buildBranchGraph(root, cwd);
      const dot = graphToDot(graph);

      if (opts.out) {
        await execa("dot", ["-Tpng", "-o", opts.out], {
          input: dot,
          cwd,
        });
        console.log("Wrote %s", opts.out);
      } else {
        console.log(dot);
      }
    });
}
