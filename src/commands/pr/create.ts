import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { resolveAgentCommand, runPrintAgent } from "../../lib/agent.js";
import { CliError } from "../../lib/errors.js";
import { openEditorAndWait } from "../../lib/editor.js";
import { gh } from "../../lib/gh.js";
import { jj, jjCapture } from "../../lib/jj.js";
import type { PrOptions } from "./common.js";
import {
  getFirstLine,
  resolveBaseBranch,
  resolveRequiredBookmark,
  tryViewPrForChange,
  withChangeId,
} from "./common.js";

const DEFAULT_PR_TEMPLATE = `## Summary

## Testing
`;

export const readPullRequestTemplate = async (cwd: string): Promise<string> => {
  const directCandidates = [
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
  ];

  try {
    return await Promise.any(
      directCandidates.map(async (candidate) => {
        const absolutePath = join(cwd, candidate);
        await access(absolutePath);
        return readFile(absolutePath, "utf8");
      }),
    );
  } catch {
    // Try template directory fallback.
  }

  const templateDirectory = join(cwd, ".github/PULL_REQUEST_TEMPLATE");
  try {
    const files = await readdir(templateDirectory);
    const markdownTemplate = files
      .filter((entry) => entry.toLowerCase().endsWith(".md"))
      .toSorted()[0];
    if (markdownTemplate) {
      return await readFile(join(templateDirectory, markdownTemplate), "utf8");
    }
  } catch {
    // Fall through to default template.
  }

  return DEFAULT_PR_TEMPLATE;
};

export const getPrTitle = async (
  changeId: string,
  bookmark: string,
): Promise<string> => {
  try {
    const description = await jjCapture([
      "log",
      "-r",
      changeId,
      "-T",
      "description",
      "--no-graph",
    ]);
    const firstLine = getFirstLine(description);
    if (firstLine) {
      return firstLine;
    }
  } catch {
    // Fallback to bookmark as title.
  }
  return bookmark;
};

export type CreateOneDraftPrOptions = { openInBrowser?: boolean };

/**
 * Push bookmark, then create a draft PR with the given body. Used by pr create and pr sync.
 */
export async function createOneDraftPr(
  cwd: string,
  base: string,
  bookmark: string,
  body: string,
  options: CreateOneDraftPrOptions = {},
): Promise<void> {
  const { openInBrowser = true } = options;
  const revset = `${base}..${bookmark}`;
  const countStr = (
    await jjCapture(["log", "--count", "-r", revset], { cwd })
  ).trim();
  const commitCount = Number.parseInt(countStr, 10) || 0;
  if (commitCount === 0) {
    throw new CliError(
      `No commits between ${base} and ${bookmark}. Commit your change in jj first, then create the PR.`,
    );
  }

  const changeId = (
    await jjCapture(["log", "-r", bookmark, "-T", "change_id", "--no-graph"], {
      cwd,
    })
  ).trim();
  const title = await getPrTitle(changeId, bookmark);

  console.log("[pr create] Pushing branch %s...", bookmark);
  try {
    await jj(["git", "push", "--bookmark", bookmark], { cwd });
  } catch (pushErr) {
    const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
    if (
      msg.includes("Non-tracking remote bookmark") &&
      msg.includes("exists")
    ) {
      console.log(
        "[pr create] Remote bookmark exists; tracking and retrying push...",
      );
      await jj(["bookmark", "track", bookmark, "--remote", "origin"], {
        cwd,
      });
      await jj(["git", "push", "--bookmark", bookmark], { cwd });
    } else {
      throw pushErr;
    }
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "jj-scripts-pr-"));
  const bodyPath = join(tempDirectory, "pr-body.md");
  try {
    await writeFile(bodyPath, `${body}\n`, "utf8");
    console.log("[pr create] Running gh pr create...");
    await gh(
      [
        "pr",
        "create",
        "--draft",
        "--base",
        base,
        "--head",
        bookmark,
        "--title",
        title,
        "--body-file",
        bodyPath,
      ],
      { cwd },
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  if (openInBrowser) {
    console.log("[pr create] Opening PR in browser...");
    await gh(["pr", "view", bookmark, "--web"], { cwd });
  }
}

const PR_BODY_AGENT_TIMEOUT_MS = 60_000 * 5; // 5 minutes

/**
 * Generate PR body using the configured agent (e.g. Cursor CLI). Returns null if no agent
 * is available or the agent returns empty. Callers should fall back to template + editor.
 */
export const generatePrBody = async (args: {
  changeId: string;
  bookmark: string;
  title: string;
  template: string;
}): Promise<string | null> => {
  const prompt = [
    "Generate a GitHub pull request body in Markdown.",
    "Strict rules:",
    "- Return only Markdown body text.",
    "- Preserve the template headings and structure.",
    "- Fill in concrete details based on the provided context.",
    "",
    `Bookmark: ${args.bookmark}`,
    `Change ID: ${args.changeId}`,
    `PR title: ${args.title}`,
    "",
    "Template:",
    args.template,
  ].join("\n");

  console.log(
    "[pr create] Asking agent to generate PR body (timeout %ds)...",
    PR_BODY_AGENT_TIMEOUT_MS / 1000,
  );
  const output = await runPrintAgent({
    cwd: process.cwd(),
    prompt,
    timeoutMs: PR_BODY_AGENT_TIMEOUT_MS,
  });
  if (output?.trim()) {
    console.log("[pr create] Agent returned (%d chars).", output.length);
    return output.trim();
  }
  return null;
};

export const createDraftPr = async (
  changeId: string,
  bookmark: string,
): Promise<void> => {
  const cwd = process.cwd();
  const base = await resolveBaseBranch(cwd);
  console.log("[pr create] Creating draft PR for bookmark %s...", bookmark);
  const title = await getPrTitle(changeId, bookmark);
  const template = await readPullRequestTemplate(cwd);
  let generatedBody = await generatePrBody({
    changeId,
    bookmark,
    title,
    template,
  });
  if (generatedBody == null || generatedBody.length === 0) {
    console.warn(
      "[pr create] No agent available or agent returned empty; using template and opening editor.",
    );
    generatedBody = template;
  }
  const tempDirectory = await mkdtemp(join(tmpdir(), "jj-scripts-pr-"));
  const bodyPath = join(tempDirectory, "pr-body.md");
  try {
    await writeFile(bodyPath, `${generatedBody}\n`, "utf8");
    await openEditorAndWait(bodyPath, { logPrefix: "pr create" });
    const body = await readFile(bodyPath, "utf8");
    await createOneDraftPr(cwd, base, bookmark, body.trim(), {
      openInBrowser: true,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

type CreateOptions = PrOptions & { checkAgent?: boolean };

export const registerCreate = (pr: Command): void => {
  pr.command("create")
    .description(
      "Create a draft PR (or view existing one) for the change's bookmark",
    )
    .option("-c, --change-id <id>", "Change ID (required unless --check-agent)")
    .option(
      "--check-agent",
      "Only run agent runner check and exit (for debugging)",
    )
    .action(async (opts: CreateOptions) => {
      if (opts.checkAgent) {
        const resolved = await resolveAgentCommand();
        console.log(
          "[pr create] Agent runner: %s",
          resolved ? resolved.argv.join(" ") : "not found",
        );
        return;
      }
      const changeId = withChangeId(opts);
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPrForChange(changeId, bookmark);
      if (!wasOpened) {
        await createDraftPr(changeId, bookmark);
      }
    });
};
