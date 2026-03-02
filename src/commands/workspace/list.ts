import type { Command } from "commander";
import { jjCapture } from "../../lib/jj.js";
import { listWorkspaceNames } from "./registry.js";

export function registerWorkspaceList(workspace: Command): void {
  workspace
    .command("list")
    .description(
      "List workspace names from the registry (one per line, for jjui pickers)",
    )
    .action(async () => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const names = await listWorkspaceNames(repoRoot);
      for (const name of names) {
        console.log(name);
      }
    });
}
