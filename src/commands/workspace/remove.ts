import { rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { Command } from "commander";
import { jj, jjCapture } from "../../lib/jj.js";
import { forgetWorkspaceRecord, lookupWorkspacePath } from "./registry.js";

type WorkspaceRemoveOptions = {
  path?: string;
  keepFiles?: boolean;
};

const resolvePathOption = (repoRoot: string, path: string): string =>
  isAbsolute(path) ? path : resolve(repoRoot, path);

const isUnsafeDeleteTarget = (repoRoot: string, target: string): boolean =>
  target === "/" || target === repoRoot;

export function registerWorkspaceRemove(workspace: Command): void {
  workspace
    .command("remove <name>")
    .description("Forget a jj workspace and delete its directory")
    .option("-p, --path <path>", "Workspace path to delete (optional if tracked by this CLI)")
    .option("--keep-files", "Forget the workspace but keep files on disk", false)
    .action(async (name: string, opts: WorkspaceRemoveOptions) => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const workspaceName = name.trim();

      let workspacePath: string | undefined;
      if (opts.path?.trim()) {
        workspacePath = resolvePathOption(repoRoot, opts.path.trim());
      } else {
        workspacePath = await lookupWorkspacePath(repoRoot, workspaceName);
      }

      await jj(["workspace", "forget", workspaceName], { cwd: repoRoot });

      if (!opts.keepFiles && workspacePath) {
        if (isUnsafeDeleteTarget(repoRoot, workspacePath)) {
          throw new Error(`Refusing to delete unsafe path: ${workspacePath}`);
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
