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
import { jj, jjCapture } from "../../lib/jj.js";
import { promptLine } from "../../lib/prompt.js";
import {
  forgetWorkspaceRecord,
  listWorkspaceNames,
  lookupWorkspacePath,
} from "./registry.js";

type WorkspaceRemoveOptions = {
  path?: string;
  keepFiles?: boolean;
  force?: boolean;
};

const resolvePathOption = (repoRoot: string, path: string): string =>
  isAbsolute(path) ? path : resolve(repoRoot, path);

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

export function registerWorkspaceRemove(workspace: Command): void {
  workspace
    .command("remove [name]")
    .description(
      "Forget a jj workspace and delete its directory. If name is omitted and stdin is a TTY, list workspaces and prompt to pick one.",
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
    .action(async (name: string | undefined, opts: WorkspaceRemoveOptions) => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const workspaceRoot = getWorkspaceRoot(repoRoot);
      let workspaceName: string;
      if (!name?.trim()) {
        if (!process.stdin.isTTY) {
          exitWith(1, "name required (run with a TTY to pick from list)");
        }
        const names = await listWorkspaceNames(repoRoot);
        if (names.length === 0) {
          exitWith(1, "No workspaces in registry.");
        }
        for (let i = 0; i < names.length; i++) {
          console.log(`${i + 1}. ${names[i]}`);
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

      let workspacePath: string | undefined;
      if (opts.path?.trim()) {
        workspacePath = resolvePathOption(repoRoot, opts.path.trim());
      } else {
        workspacePath = await lookupWorkspacePath(repoRoot, workspaceName);
      }

      await jj(["workspace", "forget", workspaceName], { cwd: repoRoot });

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
        await rm(workspacePath, { recursive: true, force: true });
      } else if (!opts.keepFiles && !workspacePath) {
        console.warn(
          `Forgot workspace '${workspaceName}', but no workspace path was found to delete.`,
        );
      }

      await forgetWorkspaceRecord(repoRoot, workspaceName);
    });
}
