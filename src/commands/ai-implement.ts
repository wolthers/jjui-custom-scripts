import type { Command } from "commander";
import { exitWith } from "../lib/errors.js";
import { jjCapture } from "../lib/jj.js";
import { promptLine } from "../lib/prompt.js";
import { runInteractiveAgent } from "../lib/agent.js";
import {
  createWorkspace,
  type CreateWorkspaceOptions,
} from "./workspace/add.js";

const SETUP_PROMPT = [
  "Set up this fresh workspace for development.",
  "Priorities:",
  "1) Ensure relevant environment files exist for local development.",
  "2) Run minimal setup commands needed to make the repo ready.",
  "3) Avoid destructive operations and keep changes focused to setup only.",
].join("\n");

type AiImplementOptions = CreateWorkspaceOptions & {
  prefix?: string;
  skipSetupPrompt?: boolean;
};

export function registerAiImplement(program: Command): void {
  program
    .command("ai-implement [destination]")
    .description(
      "Create a jj workspace, then launch the agent in plan mode. You describe your task directly in the agent session. The agent owns this terminal tab until it exits.",
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
      "--skip-setup-prompt",
      "Do not send the workspace setup prompt to the agent",
      false,
    )
    .action(
      async (destination: string | undefined, opts: AiImplementOptions) => {
        const repoRoot = (await jjCapture(["root"])).trim();
        let resolvedDestination: string;
        let bookmarkName: string;
        if (!destination?.trim()) {
          if (!process.stdin.isTTY) {
            exitWith(
              1,
              "destination required for ai-implement (run with a TTY to prompt)",
            );
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

        const initialPrompt = opts.skipSetupPrompt ? undefined : SETUP_PROMPT;

        await runInteractiveAgent({
          cwd: workspacePath,
          plan: true,
          initialPrompt,
        });
      },
    );
}
