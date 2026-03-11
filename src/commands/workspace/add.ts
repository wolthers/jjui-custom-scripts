import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Command } from "commander";
import { execa } from "execa";
import { exitWith } from "../../lib/errors.js";
import { jj, jjCapture } from "../../lib/jj.js";
import { spawnWorkspaceOpener } from "../../lib/openWorkspace.js";
import { promptLine } from "../../lib/prompt.js";
import { rememberWorkspace } from "./registry.js";

type WorkspaceAddOptions = {
  name?: string;
  revision?: string[];
  message?: string;
  sparsePatterns?: "copy" | "full" | "empty";
  prefix?: string;
  open?: boolean;
};

const ENV_FILE_PATTERN = /^\.env(?:\..+)?$/;
const ENV_FILE_EXCLUDES = [".example", ".sample", ".template"];

/** Resolve workspace path: absolute as-is; relative under workspace root (sibling of repo). */
export const toWorkspacePath = (
  destination: string,
  repoRoot: string,
): string =>
  isAbsolute(destination)
    ? destination
    : resolve(dirname(repoRoot), destination);

export const isRelevantEnvFile = (name: string): boolean =>
  ENV_FILE_PATTERN.test(name) &&
  !ENV_FILE_EXCLUDES.some((suffix) => name.endsWith(suffix));

const copyRelevantEnvFiles = async (
  sourcePath: string,
  destinationPath: string,
): Promise<string[]> => {
  const entries = await readdir(sourcePath, { withFileTypes: true });
  const envFiles = entries
    .filter((entry) => entry.isFile() && isRelevantEnvFile(entry.name))
    .map((entry) => entry.name);

  await Promise.all(
    envFiles.map(async (envFile) => {
      const sourceFile = join(sourcePath, envFile);
      const destinationFile = join(destinationPath, envFile);
      await copyFile(sourceFile, destinationFile);
    }),
  );

  return envFiles.toSorted();
};

export const inferWorkspaceName = (
  workspacePath: string,
  explicitName?: string,
): string => {
  const name = explicitName?.trim();
  return name && name.length > 0 ? name : basename(workspacePath);
};

export type CreateWorkspaceOptions = {
  name?: string | undefined;
  revision?: string[] | undefined;
  message?: string | undefined;
  sparsePatterns?: string | undefined;
};

export type CreateWorkspaceResult = {
  workspacePath: string;
  workspaceName: string;
};

/**
 * Register a jj workspace directory as a git worktree so that nix/direnv can
 * use `git ls-files` for file enumeration (respecting .gitignore) instead of
 * hashing the entire working tree. Without this, `use flake` in .envrc rehashes
 * node_modules and other large ignored directories on every new shell.
 *
 * Silently skips if the repo is not git-backed or the bookmark isn't visible to git.
 */
async function setupGitWorktree(
  repoRoot: string,
  workspacePath: string,
  workspaceName: string,
  bookmarkName: string,
): Promise<void> {
  const gitCommonDirResult = await execa(
    "git",
    ["-C", repoRoot, "rev-parse", "--git-common-dir"],
    { reject: false },
  );
  if (gitCommonDirResult.exitCode !== 0) return;

  const rawGitCommonDir = gitCommonDirResult.stdout.trim();
  const commonGitDir = isAbsolute(rawGitCommonDir)
    ? rawGitCommonDir
    : join(repoRoot, rawGitCommonDir);

  const shaResult = await execa(
    "git",
    ["-C", repoRoot, "rev-parse", bookmarkName],
    { reject: false },
  );
  if (shaResult.exitCode !== 0 || !shaResult.stdout.trim()) return;
  const commitSha = shaResult.stdout.trim();

  const worktreeMetaDir = join(commonGitDir, "worktrees", workspaceName);
  await mkdir(worktreeMetaDir, { recursive: true });
  await writeFile(join(worktreeMetaDir, "gitdir"), join(workspacePath, ".git"));
  await writeFile(join(worktreeMetaDir, "commondir"), "../..");
  await writeFile(join(worktreeMetaDir, "HEAD"), commitSha);
  await writeFile(
    join(workspacePath, ".git"),
    `gitdir: ${join(commonGitDir, "worktrees", workspaceName)}\n`,
  );

  // Populate the git index so git ls-files works in the workspace
  await execa("git", ["read-tree", commitSha], {
    env: { ...process.env, GIT_DIR: worktreeMetaDir, GIT_WORK_TREE: workspacePath },
    cwd: workspacePath,
    reject: false,
  });

  console.log("Set up git worktree for fast direnv/nix evaluation.");
}

/**
 * Create a jj workspace and prepare it (copy .env files).
 * Used by workspace add, pr checkout, and ai-implement.
 */
export async function createWorkspace(
  repoRoot: string,
  resolvedDestination: string,
  bookmarkName: string,
  opts: CreateWorkspaceOptions,
): Promise<CreateWorkspaceResult> {
  const workspacePath = toWorkspacePath(resolvedDestination, repoRoot);
  const workspaceName = inferWorkspaceName(workspacePath, opts.name);

  const args = ["workspace", "add", workspacePath];
  if (opts.name?.trim()) {
    args.push("--name", opts.name.trim());
  }
  const parents =
    (opts.revision ?? []).length > 0 ? opts.revision! : ["trunk()"];
  for (const revision of parents) {
    args.push("-r", revision);
  }
  if (opts.message?.trim()) {
    args.push("-m", opts.message.trim());
  }
  if (opts.sparsePatterns?.trim()) {
    args.push("--sparse-patterns", opts.sparsePatterns.trim());
  }
  await jj(args, { cwd: repoRoot });

  await jj(["bookmark", "set", bookmarkName, "-r", `${workspaceName}@`], {
    cwd: repoRoot,
  });
  console.log(`Set bookmark: ${bookmarkName}`);

  await setupGitWorktree(repoRoot, workspacePath, workspaceName, bookmarkName);

  const copiedEnvFiles = await copyRelevantEnvFiles(repoRoot, workspacePath);
  if (copiedEnvFiles.length > 0) {
    console.log(`Copied env files: ${copiedEnvFiles.join(", ")}`);
  } else {
    console.log("No relevant .env files found to copy.");
  }

  await rememberWorkspace({
    repoRoot,
    workspace: workspaceName,
    path: workspacePath,
    bookmark: bookmarkName,
  });

  return { workspacePath, workspaceName };
}

export function registerWorkspaceAdd(workspace: Command): void {
  workspace
    .command("add [destination]")
    .description(
      "Create a jj workspace and prepare it (copy .env files). If destination is omitted and stdin is a TTY, prompts for a name (prefixed with workspace-).",
    )
    .option(
      "--name <name>",
      "Workspace name (defaults to destination basename)",
    )
    .option(
      "-r, --revision <rev>",
      "Parent change/revision for the new workspace (default: trunk())",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "-m, --message <message>",
      "Working-copy change description for the new workspace",
    )
    .option(
      "--sparse-patterns <mode>",
      "Sparse mode for jj workspace add: copy, full, or empty",
      "copy",
    )
    .option(
      "--prefix <prefix>",
      "Prepend to destination (e.g. 'workspace-' for jjui: user types 'foo' -> workspace-foo)",
    )
    .option("--no-open", "Do not open the workspace in Cursor")
    .action(
      async (destination: string | undefined, opts: WorkspaceAddOptions) => {
        const repoRoot = (await jjCapture(["root"])).trim();
        let resolvedDestination: string;
        let bookmarkName: string;
        if (!destination?.trim()) {
          if (!process.stdin.isTTY) {
            exitWith(1, "destination required (run with a TTY to prompt)");
          }
          const input = await promptLine(
            "Workspace name (will be prefixed with workspace-): ",
          );
          if (!input) {
            exitWith(1, "destination required");
          }
          resolvedDestination = "workspace-" + input;
          bookmarkName = input;
        } else {
          resolvedDestination = opts.prefix?.trim()
            ? opts.prefix.trim() + destination
            : destination;
          bookmarkName = destination;
        }
        const { workspacePath } = await createWorkspace(
          repoRoot,
          resolvedDestination,
          bookmarkName,
          {
            name: opts.name,
            revision: opts.revision,
            message: opts.message,
            sparsePatterns: opts.sparsePatterns,
          },
        );
        if (opts.open !== false) {
          spawnWorkspaceOpener(workspacePath, { label: "workspace add" });
        }
      },
    );
}
