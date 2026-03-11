import type { Command } from "commander";
import { EXIT_NO_BOOKMARK, exitWith } from "../../lib/errors.js";
import { gh } from "../../lib/gh.js";
import { jj, jjCapture } from "../../lib/jj.js";
import { promptLine } from "../../lib/prompt.js";
import { spawnWorkspaceOpener } from "../../lib/openWorkspace.js";
import {
  createWorkspace,
  type CreateWorkspaceOptions,
} from "../workspace/add.js";
import type { PrOptions } from "./common.js";
import {
  getChangeDescription,
  parsePrNumberFromMessage,
  resolveRequiredBookmark,
  withChangeId,
} from "./common.js";

type PrCheckoutOptions = CreateWorkspaceOptions &
  PrOptions & {
    open?: boolean;
    prefix?: string;
  };

async function getPrBranch(prNumber: number, cwd: string): Promise<string> {
  const { stdout } = await gh(
    ["pr", "view", String(prNumber), "--json", "headRefName"],
    { cwd },
  );
  const data = JSON.parse(stdout.trim()) as { headRefName: string };
  const branch = data.headRefName?.trim();
  if (!branch) {
    exitWith(1, `Could not resolve branch for PR #${prNumber}`);
  }
  return branch;
}

async function getPrNumberFromChange(
  changeId: string,
  cwd: string,
): Promise<number> {
  const bookmark = await resolveRequiredBookmark(changeId);
  const { stdout } = await gh(
    ["pr", "list", "--head", bookmark, "--state", "open", "--json", "number"],
    { cwd },
  );
  const prs = JSON.parse(stdout.trim()) as { number: number }[];
  if (Array.isArray(prs) && prs.length > 0 && prs[0]?.number != null) {
    return prs[0].number;
  }
  const description = await getChangeDescription(changeId);
  const fromDesc = parsePrNumberFromMessage(description);
  if (fromDesc != null) {
    return fromDesc;
  }
  exitWith(EXIT_NO_BOOKMARK, `No PR found for bookmark '${bookmark}'.`);
}

export function registerCheckout(pr: Command): void {
  pr.command("checkout [pr-number]")
    .description(
      "Check out a PR in a new jj workspace. Creates a full workspace (env files, direnv) and runs jj edit <branch>@origin in it.",
    )
    .option(
      "-c, --change-id <id>",
      "Change ID (resolve PR from change's bookmark)",
    )
    .option(
      "--prefix <prefix>",
      "Prepend to workspace destination",
      "workspace-pr-",
    )
    .option(
      "--sparse-patterns <mode>",
      "Sparse mode for jj workspace add: copy, full, or empty",
      "copy",
    )
    .option("--no-open", "Do not open the workspace in Cursor")
    .action(
      async (prNumberStr: string | undefined, opts: PrCheckoutOptions) => {
        const repoRoot = (await jjCapture(["root"])).trim();

        let prNumber: number;
        if (opts.changeId?.trim()) {
          prNumber = await getPrNumberFromChange(withChangeId(opts), repoRoot);
          console.log("[pr checkout] Resolved PR #%d from change.", prNumber);
        } else if (prNumberStr?.trim()) {
          prNumber = Number.parseInt(prNumberStr, 10);
          if (Number.isNaN(prNumber) || prNumber <= 0) {
            exitWith(1, `Invalid PR number: ${prNumberStr}`);
          }
        } else if (process.stdin.isTTY) {
          const raw = await promptLine("PR number: ");
          prNumber = Number.parseInt(raw, 10);
          if (Number.isNaN(prNumber) || prNumber <= 0) {
            exitWith(1, `Invalid PR number: ${raw}`);
          }
        } else {
          exitWith(
            1,
            "Provide PR number, --change-id, or run with a TTY to prompt.",
          );
        }

        console.log("[pr checkout] Fetching PR #%d...", prNumber);
        const branch = await getPrBranch(prNumber, repoRoot);
        console.log("[pr checkout] PR #%d branch: %s", prNumber, branch);

        await jj(["git", "fetch"], { cwd: repoRoot });

        const destination = `${opts.prefix ?? "workspace-pr-"}${branch}`;

        const { workspacePath } = await createWorkspace(
          repoRoot,
          destination,
          branch,
          {
            sparsePatterns: opts.sparsePatterns,
          },
        );

        await jj(["new", `${branch}@origin`], { cwd: workspacePath });
        console.log(
          "[pr checkout] Checked out PR #%d (%s) in %s",
          prNumber,
          branch,
          workspacePath,
        );

        if (opts.open !== false) {
          spawnWorkspaceOpener(workspacePath, { label: "pr checkout" });
        }
      },
    );
}
