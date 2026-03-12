import type { Command } from "commander";
import { exitWith } from "../../lib/errors.js";
import { jjCapture } from "../../lib/jj.js";
import { spawnWorkspaceOpener } from "../../lib/openWorkspace.js";
import { promptLine } from "../../lib/prompt.js";
import {
  listJjWorkspaceNames,
  listRegistryWorkspaceNames,
  lookupWorkspacePath,
} from "./registry.js";

async function resolveWorkspacePath(
  repoRoot: string,
  name: string,
): Promise<string> {
  const fromRegistry = await lookupWorkspacePath(repoRoot, name);
  if (fromRegistry) return fromRegistry;

  try {
    const raw = await jjCapture(["workspace", "root", `--name=${name}`], {
      cwd: repoRoot,
    });
    const path = raw.trim();
    if (path) return path;
  } catch {
    // fall through
  }

  exitWith(1, `No path found for workspace '${name}'. Is it tracked?`);
}

export function registerWorkspaceOpen(workspace: Command): void {
  workspace
    .command("open [name]")
    .description(
      "Open a jj workspace in Cursor. If name is omitted and stdin is a TTY, lists workspaces and prompts to pick one.",
    )
    .action(async (name: string | undefined) => {
      const repoRoot = (await jjCapture(["root"])).trim();

      let workspaceName: string;
      if (!name?.trim()) {
        if (!process.stdin.isTTY) {
          exitWith(1, "name required (run with a TTY to pick from list)");
        }

        const names = await listJjWorkspaceNames(repoRoot);
        const registryNames = await listRegistryWorkspaceNames(repoRoot);
        const registrySet = new Set(registryNames);
        const all = [...new Set([...names, ...registryNames])].toSorted();

        if (all.length === 0) {
          exitWith(1, "No workspaces found.");
        }
        console.log("Select the workspace you want to open:\n");
        for (let i = 0; i < all.length; i++) {
          const n = all[i]!;
          const suffix = registrySet.has(n) ? " (tracked)" : "";
          console.log(`${i + 1}. ${n}${suffix}`);
        }
        const input = await promptLine("Pick workspace (number or name): ");
        const byIndex =
          /^\d+$/.test(input) &&
          Number(input) >= 1 &&
          Number(input) <= all.length;
        workspaceName = byIndex ? all[Number(input) - 1]! : input.trim();
        if (!workspaceName) {
          exitWith(1, "name required");
        }
      } else {
        workspaceName = name.trim();
      }

      const workspacePath = await resolveWorkspacePath(repoRoot, workspaceName);
      console.log(
        "[workspace open] Opening %s in Cursor (%s)...",
        workspaceName,
        workspacePath,
      );
      spawnWorkspaceOpener(workspacePath, { label: "workspace open" });
    });
}
