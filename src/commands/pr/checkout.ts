import type { Command } from "commander";
import { exitWith } from "../../lib/errors.js";
import { gh } from "../../lib/gh.js";
import { jj, jjCapture } from "../../lib/jj.js";
import {
  createWorkspace,
  type CreateWorkspaceOptions,
} from "../workspace/add.js";

type PrCheckoutOptions = CreateWorkspaceOptions & {
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

export function registerCheckout(pr: Command): void {
  pr.command("checkout <pr-number>")
    .description(
      "Check out a PR in a new jj workspace. Creates a full workspace (env files, direnv) and runs jj new <branch>@origin in it.",
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
    .action(async (prNumberStr: string, opts: PrCheckoutOptions) => {
      const prNumber = Number.parseInt(prNumberStr, 10);
      if (Number.isNaN(prNumber) || prNumber <= 0) {
        exitWith(1, `Invalid PR number: ${prNumberStr}`);
      }

      const repoRoot = (await jjCapture(["root"])).trim();

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
    });
}
