import { execa } from "execa";
import { copyFile, readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Command } from "commander";
import { exitWith } from "../../lib/errors.js";
import { jj, jjCapture } from "../../lib/jj.js";
import { promptLine } from "../../lib/prompt.js";
import { rememberWorkspace } from "./registry.js";

type WorkspaceAddOptions = {
  name?: string;
  revision?: string[];
  message?: string;
  sparsePatterns?: "copy" | "full" | "empty";
  prefix?: string;
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
 * Create a jj workspace and prepare it (copy .env files, direnv allow).
 * Used by both workspace add and ai-implement.
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

  await jj(["bookmark", "create", bookmarkName, "-r", `${workspaceName}@`], {
    cwd: repoRoot,
  });
  console.log(`Created bookmark: ${bookmarkName}`);

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
  });

  try {
    await execa("direnv", ["allow"], { cwd: workspacePath });
    console.log("Ran direnv allow in workspace.");
  } catch {
    // direnv not installed or no .envrc - skip silently
  }

  return { workspacePath, workspaceName };
}

export function registerWorkspaceAdd(workspace: Command): void {
  workspace
    .command("add [destination]")
    .description(
      "Create a jj workspace and prepare it (copy .env files, direnv allow). If destination is omitted and stdin is a TTY, prompts for a name (prefixed with workspace-).",
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
        await createWorkspace(repoRoot, resolvedDestination, bookmarkName, {
          name: opts.name,
          revision: opts.revision,
          message: opts.message,
          sparsePatterns: opts.sparsePatterns,
        });
      },
    );
}
