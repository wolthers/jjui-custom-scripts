import { execa } from "execa";
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
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
  promptFile?: string;
  skipSetupAgent?: boolean;
  skipTaskAgent?: boolean;
};

const DEFAULT_PROMPT_FILE = ".jj-workspace-task.md";
const ENV_FILE_PATTERN = /^\.env(?:\..+)?$/;
const ENV_FILE_EXCLUDES = [".example", ".sample", ".template"];

const INTERACTIVE_SETUP_PROMPT = [
  "Set up this fresh workspace for development.",
  "Priorities:",
  "1) Ensure relevant environment files exist for local development.",
  "2) Run minimal setup commands needed to make the repo ready.",
  "3) Avoid destructive operations and keep changes focused to setup only.",
].join("\n");

const NON_INTERACTIVE_SETUP_PROMPT = [
  INTERACTIVE_SETUP_PROMPT,
  "",
  "Important: This runs in a non-interactive context. Do not ask the user questions in the terminal (e.g. scope of setup or env file creation). Proceed with sensible defaults (e.g. monorepo-wide minimal bootstrap, create local env files from templates where needed, lightweight setup only) and state what you did.",
].join("\n");

/** Chooses setup prompt by TTY: interactive prompt when stdin is a TTY, non-interactive otherwise. */
export function getSetupPrompt(tty: boolean): string {
  return tty ? INTERACTIVE_SETUP_PROMPT : NON_INTERACTIVE_SETUP_PROMPT;
}

const DEFAULT_TASK_FILE_TEMPLATE = `# Workspace Task Prompt

Describe the first task for Cursor Agent in this workspace.
Be explicit about scope, constraints, and desired output.
`;

/** Resolve workspace path: absolute as-is; relative under workspace root (sibling of repo). */
const toWorkspacePath = (destination: string, repoRoot: string): string =>
  isAbsolute(destination)
    ? destination
    : resolve(dirname(repoRoot), destination);

export const isRelevantEnvFile = (name: string): boolean =>
  ENV_FILE_PATTERN.test(name) &&
  !ENV_FILE_EXCLUDES.some((suffix) => name.endsWith(suffix));

/** Open a new Cursor window with the workspace and the prompt file in it, wait for close. */
const openCursorAndWait = async (
  workspacePath: string,
  promptFilePath: string,
): Promise<void> => {
  await execa("cursor", ["-n", workspacePath, promptFilePath, "--wait"], {
    stdio: "inherit",
  });
};

const runCursorAgent = async (
  workspacePath: string,
  prompt: string,
): Promise<void> => {
  await execa(
    "cursor",
    [
      "agent",
      "--print",
      "--trust",
      "--force",
      "--workspace",
      workspacePath,
      prompt,
    ],
    {
      cwd: workspacePath,
      stdio: "inherit",
    },
  );
};

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

const inferWorkspaceName = (
  workspacePath: string,
  explicitName?: string,
): string => {
  const name = explicitName?.trim();
  return name && name.length > 0 ? name : basename(workspacePath);
};

export function registerWorkspaceAdd(workspace: Command): void {
  workspace
    .command("add [destination]")
    .description(
      "Create a jj workspace, prepare it, and run an initial Cursor task prompt. If destination is omitted and stdin is a TTY, prompts for a name (prefixed with workspace-).",
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
    .option(
      "--prompt-file <path>",
      "Path (relative to workspace root) to the task prompt file",
      DEFAULT_PROMPT_FILE,
    )
    .option(
      "--skip-setup-agent",
      "Skip running the initial Cursor setup agent",
      false,
    )
    .option(
      "--skip-task-agent",
      "Skip running Cursor agent for the task prompt",
      false,
    )
    .action(
      async (destination: string | undefined, opts: WorkspaceAddOptions) => {
        const repoRoot = (await jjCapture(["root"])).trim();
        let resolvedDestination: string;
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
        } else {
          resolvedDestination = opts.prefix?.trim()
            ? opts.prefix.trim() + destination
            : destination;
        }
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

        const copiedEnvFiles = await copyRelevantEnvFiles(
          repoRoot,
          workspacePath,
        );
        if (copiedEnvFiles.length > 0) {
          console.log(`Copied env files: ${copiedEnvFiles.join(", ")}`);
        } else {
          console.log("No relevant .env files found to copy.");
        }

        if (!opts.skipSetupAgent) {
          const setupPrompt = getSetupPrompt(process.stdin.isTTY ?? false);
          await runCursorAgent(workspacePath, setupPrompt);
        }

        const promptFilePath = join(
          workspacePath,
          opts.promptFile ?? DEFAULT_PROMPT_FILE,
        );
        await writeFile(promptFilePath, DEFAULT_TASK_FILE_TEMPLATE, "utf8");
        await openCursorAndWait(workspacePath, promptFilePath);

        const taskPrompt = (await readFile(promptFilePath, "utf8")).trim();
        if (taskPrompt.length === 0) {
          console.warn(
            `Prompt file '${promptFilePath}' was empty. Skipping task agent.`,
          );
        } else if (!opts.skipTaskAgent) {
          await runCursorAgent(workspacePath, taskPrompt);
        }

        await rememberWorkspace({
          repoRoot,
          workspace: workspaceName,
          path: workspacePath,
        });
      },
    );
}
