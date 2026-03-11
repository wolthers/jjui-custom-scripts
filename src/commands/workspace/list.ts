import type { Command } from "commander";
import { EXIT_EMPTY, exitWith } from "../../lib/errors.js";
import { jjCapture, splitLines } from "../../lib/jj.js";
import {
  listRegistryWorkspaceNames,
  reconcileWorkspaceRegistry,
  type RegistryOutOfSyncRecord,
} from "./registry.js";

const parseWorkspaceNameLine = (line: string): string => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // fall through
    }
  }
  return trimmed;
};

async function listJjWorkspaceNames(repoRoot: string): Promise<string[]> {
  const raw = await jjCapture(["workspace", "list", "-T", 'name ++ "\\n"'], {
    cwd: repoRoot,
  });
  return splitLines(raw)
    .map(parseWorkspaceNameLine)
    .filter((s) => s.length > 0);
}

function warnOutOfSync(records: RegistryOutOfSyncRecord[]): void {
  for (const record of records) {
    if (record.reason === "missing-folder") {
      console.warn(
        `Warning: Registry entry '${record.workspace}' pointed to missing folder '${record.path}'. Removed from registry.`,
      );
      continue;
    }
    const suffix = record.folderExists
      ? "Folder still exists; remove it manually if no longer needed."
      : "Folder is also missing.";
    console.warn(
      `Warning: Registry entry '${record.workspace}' exists, but jj no longer has that workspace. Removed from registry. ${suffix}`,
    );
  }
}

export function registerWorkspaceList(workspace: Command): void {
  workspace
    .command("list")
    .description("List jj workspaces (from jj, with paths from registry)")
    .option("--registry-only", "List only workspaces tracked in registry")
    .action(async (opts: { registryOnly?: boolean }) => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const jjNames = await listJjWorkspaceNames(repoRoot);
      const outOfSync = await reconcileWorkspaceRegistry({
        repoRoot,
        jjWorkspaceNames: jjNames,
      });
      warnOutOfSync(outOfSync);
      if (opts.registryOnly) {
        console.log("[workspace list] Listing workspaces...");
        const names = await listRegistryWorkspaceNames(repoRoot);
        if (names.length === 0) {
          exitWith(EXIT_EMPTY, "No workspaces in registry.");
        }
        for (const name of names) {
          console.log(name);
        }
        return;
      }
      if (jjNames.length === 0) {
        exitWith(
          EXIT_EMPTY,
          "No workspaces. Use 'workspace add' to create one.",
        );
      }
      const out = await jjCapture(["workspace", "list"], { cwd: repoRoot });
      console.log(out.trim());
      if (process.stdin.isTTY) {
        await waitForAnyKey();
      }
    });
}

function waitForAnyKey(): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write("\nPress any key to continue...");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      resolve();
    });
  });
}
