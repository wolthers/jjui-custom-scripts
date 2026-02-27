import { execa } from "execa";
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { Command } from "commander";
import { jj, jjCapture } from "../../lib/jj.js";
import { rememberWorkspace } from "./registry.js";

type WorkspaceAddOptions = {
  name?: string;
  revision?: string[];
  message?: string;
  sparsePatterns?: "copy" | "full" | "empty";
  promptFile?: string;
  skipSetupAgent?: boolean;
  skipTaskAgent?: boolean;
};

const DEFAULT_PROMPT_FILE = ".jj-workspace-task.md";
const ENV_FILE_PATTERN = /^\.env(?:\..+)?$/;
const ENV_FILE_EXCLUDES = [".example", ".sample", ".template"];
const DEFAULT_SETUP_PROMPT = [
  "Set up this fresh workspace for development.",
  "Priorities:",
  "1) Ensure relevant .env files exist for local development.",
  "2) Run minimal setup commands needed to make the repo ready.",
  "3) Avoid destructive operations and keep changes focused to setup only.",
].join("\n");

const DEFAULT_TASK_FILE_TEMPLATE = `# Workspace Task Prompt

Describe the first task for Cursor Agent in this workspace.
Be explicit about scope, constraints, and desired output.
`;

const toWorkspacePath = (repoRoot: string, destination: string): string =>
  isAbsolute(destination) ? destination : resolve(repoRoot, destination);

const isRelevantEnvFile = (name: string): boolean =>
  ENV_FILE_PATTERN.test(name) && !ENV_FILE_EXCLUDES.some((suffix) => name.endsWith(suffix));

const openCursorAndWait = async (workspacePath: string, promptFilePath: string): Promise<void> => {
  await execa("cursor", ["-n", workspacePath, promptFilePath, "--wait"], { stdio: "inherit" });
};

const runCursorAgent = async (workspacePath: string, prompt: string): Promise<void> => {
  await execa(
    "cursor",
    ["agent", "--print", "--trust", "--force", "--workspace", workspacePath, prompt],
    {
      cwd: workspacePath,
      stdio: "inherit",
    },
  );
};

const copyRelevantEnvFiles = async (sourcePath: string, destinationPath: string): Promise<string[]> => {
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

const inferWorkspaceName = (workspacePath: string, explicitName?: string): string => {
  const name = explicitName?.trim();
  return name && name.length > 0 ? name : basename(workspacePath);
};

export function registerWorkspaceAdd(workspace: Command): void {
  workspace
    .command("add <destination>")
    .description("Create a jj workspace, prepare it, and run an initial Cursor task prompt")
    .option("--name <name>", "Workspace name (defaults to destination basename)")
    .option(
      "-r, --revision <rev>",
      "Parent revision for the new workspace (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option("-m, --message <message>", "Working-copy change description for the new workspace")
    .option(
      "--sparse-patterns <mode>",
      "Sparse mode for jj workspace add: copy, full, or empty",
      "copy",
    )
    .option(
      "--prompt-file <path>",
      "Path (relative to workspace root) to the task prompt file",
      DEFAULT_PROMPT_FILE,
    )
    .option("--skip-setup-agent", "Skip running the initial Cursor setup agent", false)
    .option("--skip-task-agent", "Skip running Cursor agent for the task prompt", false)
    .action(async (destination: string, opts: WorkspaceAddOptions) => {
      const repoRoot = (await jjCapture(["root"])).trim();
      const workspacePath = toWorkspacePath(repoRoot, destination);
      const workspaceName = inferWorkspaceName(workspacePath, opts.name);

      const args = ["workspace", "add", workspacePath];
      if (opts.name?.trim()) {
        args.push("--name", opts.name.trim());
      }
      for (const revision of opts.revision ?? []) {
        args.push("-r", revision);
      }
      if (opts.message?.trim()) {
        args.push("-m", opts.message.trim());
      }
      if (opts.sparsePatterns?.trim()) {
        args.push("--sparse-patterns", opts.sparsePatterns.trim());
      }
      await jj(args, { cwd: repoRoot });

      const copiedEnvFiles = await copyRelevantEnvFiles(repoRoot, workspacePath);
      if (copiedEnvFiles.length > 0) {
        console.log(`Copied env files: ${copiedEnvFiles.join(", ")}`);
      } else {
        console.log("No relevant .env files found to copy.");
      }

      if (!opts.skipSetupAgent) {
        await runCursorAgent(workspacePath, DEFAULT_SETUP_PROMPT);
      }

      const promptFilePath = join(workspacePath, opts.promptFile ?? DEFAULT_PROMPT_FILE);
      await writeFile(promptFilePath, DEFAULT_TASK_FILE_TEMPLATE, "utf8");
      await openCursorAndWait(workspacePath, promptFilePath);

      const taskPrompt = (await readFile(promptFilePath, "utf8")).trim();
      if (taskPrompt.length === 0) {
        console.warn(`Prompt file '${promptFilePath}' was empty. Skipping task agent.`);
      } else if (!opts.skipTaskAgent) {
        await runCursorAgent(workspacePath, taskPrompt);
      }

      await rememberWorkspace({
        repoRoot,
        workspace: workspaceName,
        path: workspacePath,
      });
    });
}
