import { rm } from "node:fs/promises";
import {
  basename as pathBasename,
  dirname,
  isAbsolute,
  resolve,
  sep,
} from "node:path";
import type { Command } from "commander";
import { exitWith } from "../../lib/errors.js";
import { jj, jjCapture, splitLines } from "../../lib/jj.js";
import { confirmLine, promptLine } from "../../lib/prompt.js";
import {
  forgetWorkspaceRecord,
  listWorkspaceNames,
  lookupWorkspacePath,
  reconcileWorkspaceRegistry,
  type RegistryOutOfSyncRecord,
} from "./registry.js";

type WorkspaceRemoveOptions = {
  path?: string;
  keepFiles?: boolean;
  force?: boolean;
  yes?: boolean;
};

const resolvePathOption = (baseDir: string, path: string): string =>
  isAbsolute(path) ? path : resolve(baseDir, path);

/** Workspace root is the parent of the repo (siblings of the repo live here). */
const getWorkspaceRoot = (repoRoot: string): string =>
  resolve(dirname(repoRoot));

/**
 * True if target is inside workspaceRoot (sibling dir of repo), not workspaceRoot/repoRoot itself, and not /.
 */
const isAllowedDeleteTarget = (
  workspaceRoot: string,
  repoRoot: string,
  target: string,
): boolean => {
  const norm = resolve(target);
  const wsRoot = resolve(workspaceRoot);
  if (norm === "/" || norm === resolve(repoRoot) || norm === wsRoot) {
    return false;
  }
  return norm.startsWith(wsRoot + sep);
};

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

async function getCurrentWorkspaceName(repoRoot: string): Promise<string> {
  const raw = (
    await jjCapture(["log", "-r", "@", "-T", "working_copies"], {
      cwd: repoRoot,
    })
  ).trim();
  const token = raw.split(/\s+/)[0] ?? "";
  if (!token.endsWith("@")) {
    exitWith(1, "Failed to determine current jj workspace name.");
  }
  return token.slice(0, -1);
}

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

export function registerWorkspaceRemove(workspace: Command): void {
  workspace
    .command("remove [name]")
    .description(
      "Forget a jj workspace and optionally delete its directory. If name is omitted and stdin is a TTY, list workspaces and prompt to pick one.",
    )
    .option(
      "-p, --path <path>",
      "Workspace path to delete (optional if tracked by this CLI)",
    )
    .option(
      "--keep-files",
      "Forget the workspace but keep files on disk",
      false,
    )
    .option(
      "--force",
      "Allow deleting a path outside the workspace root (sibling of repo); with TTY, requires typing 'yes' to confirm",
      false,
    )
    .option("-y, --yes", "Skip confirmation prompt before delete", false)
    .action(async (name: string | undefined, opts: WorkspaceRemoveOptions) => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const workspaceRoot = getWorkspaceRoot(repoRoot);
      const jjNames = await listJjWorkspaceNames(repoRoot);
      const outOfSync = await reconcileWorkspaceRegistry({
        repoRoot,
        jjWorkspaceNames: jjNames,
      });
      warnOutOfSync(outOfSync);
      const currentWorkspace = await getCurrentWorkspaceName(repoRoot);
      let workspaceName: string;
      if (!name?.trim()) {
        if (!process.stdin.isTTY) {
          exitWith(1, "name required (run with a TTY to pick from list)");
        }
        const registryNames = await listWorkspaceNames(repoRoot);
        const registrySet = new Set(registryNames);
        const names = [...new Set([...jjNames, ...registryNames])].toSorted();
        if (names.length === 0) {
          exitWith(1, "No jj workspaces found.");
        }
        for (let i = 0; i < names.length; i++) {
          const n = names[i]!;
          const flags: string[] = [];
          if (n === currentWorkspace) flags.push("current");
          if (registrySet.has(n)) flags.push("tracked");
          const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
          console.log(`${i + 1}. ${n}${suffix}`);
        }
        const raw = await promptLine("Pick workspace (number or name): ");
        const byIndex =
          /^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= names.length;
        workspaceName = byIndex ? names[Number(raw) - 1]! : raw;
        if (!workspaceName) {
          exitWith(1, "name required");
        }
      } else {
        workspaceName = name.trim();
      }

      if (workspaceName === currentWorkspace) {
        exitWith(
          1,
          `Refusing to remove current workspace '${workspaceName}'. Switch to a different workspace and retry.`,
        );
      }

      let workspacePath: string | undefined;
      if (opts.path?.trim()) {
        workspacePath = resolvePathOption(workspaceRoot, opts.path.trim());
      } else {
        workspacePath = await lookupWorkspacePath(repoRoot, workspaceName);
      }

      if (!workspacePath) {
        try {
          workspacePath = (
            await jjCapture(["workspace", "root", `--name=${workspaceName}`], {
              cwd: repoRoot,
            })
          ).trim();
        } catch {
          workspacePath = undefined;
        }
      }

      console.log(
        "[workspace remove] Forgetting workspace %s...",
        workspaceName,
      );
      await jj(["workspace", "forget", "--", workspaceName], { cwd: repoRoot });

      if (!opts.keepFiles && workspacePath) {
        const normPath = resolve(workspacePath);
        if (normPath === "/" || normPath === resolve(repoRoot)) {
          exitWith(
            1,
            `Refusing to delete unsafe path: ${workspacePath}. Cannot delete root or repo.`,
          );
        }
        const allowed = isAllowedDeleteTarget(
          workspaceRoot,
          repoRoot,
          workspacePath,
        );
        if (!allowed && !opts.force) {
          exitWith(
            1,
            `Refusing to delete: ${workspacePath} is outside workspace root ${workspaceRoot}. Move the workspace there or pass --force.`,
          );
        }
        if (!allowed && opts.force && process.stdin.isTTY) {
          const answer = await promptLine(
            `Type 'yes' to confirm deletion of ${workspacePath}: `,
          );
          if (answer.trim().toLowerCase() !== "yes") {
            exitWith(1, "Aborted.");
          }
        }
        const dirName = pathBasename(workspacePath);
        if (dirName !== "" && !dirName.startsWith("workspace-")) {
          console.warn(
            `Warning: '${dirName}' does not start with 'workspace-'. Ensure this is the intended workspace.`,
          );
        }
        if (!opts.yes && !process.stdin.isTTY) {
          exitWith(
            1,
            "Refusing to delete without confirmation (pass --yes for non-TTY).",
          );
        }
        if (!opts.yes && process.stdin.isTTY) {
          const ok = await confirmLine(
            `Delete workspace '${workspaceName}' and its directory ${workspacePath}?`,
            false,
          );
          if (!ok) {
            exitWith(1, "Aborted.");
          }
        }
        console.log(
          "[workspace remove] Deleting directory %s...",
          workspacePath,
        );
        await rm(workspacePath, { recursive: true, force: true });
      } else if (!opts.keepFiles && !workspacePath) {
        console.warn(
          `Forgot workspace '${workspaceName}', but no workspace path was found to delete.`,
        );
      }

      await forgetWorkspaceRecord(repoRoot, workspaceName);
    });
}
