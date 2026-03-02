import { execa } from "execa";
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
    throw new Error(
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

const CURSOR_HEALTH_CHECK_TIMEOUT_MS = 10_000; // 10 seconds

/** Run a quick health check to verify the Cursor CLI is invocable in this environment. */
const checkCursorCli = async (): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}> => {
  console.log(
    "[pr create] Cursor CLI health check: running `cursor --version` (timeout %ds)...",
    CURSOR_HEALTH_CHECK_TIMEOUT_MS / 1000,
  );
  try {
    const result = await execa("cursor", ["--version"], {
      cwd: process.cwd(),
      timeout: CURSOR_HEALTH_CHECK_TIMEOUT_MS,
      reject: false,
    });
    const ok = result.exitCode === 0;
    console.log(
      "[pr create] Cursor CLI health check: exitCode=%d ok=%s stdout=%s stderr=%s",
      result.exitCode ?? "null",
      ok,
      JSON.stringify((result.stdout ?? "").trim().slice(0, 200)),
      JSON.stringify((result.stderr ?? "").trim().slice(0, 200)),
    );
    return {
      ok,
      stdout: (result.stdout ?? "").trim(),
      stderr: (result.stderr ?? "").trim(),
      ...(result.timedOut && { error: "timedOut" }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      err &&
      typeof err === "object" &&
      "timedOut" in err &&
      (err as { timedOut?: boolean }).timedOut;
    console.log(
      "[pr create] Cursor CLI health check: failed error=%s timedOut=%s",
      JSON.stringify(message.slice(0, 300)),
      timedOut,
    );
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: timedOut ? "timedOut" : message.slice(0, 200),
    };
  }
};

const generatePrBodyWithCursor = async (args: {
  changeId: string;
  bookmark: string;
  title: string;
  template: string;
}): Promise<string> => {
  const health = await checkCursorCli();
  if (!health.ok) {
    console.log(
      "[pr create] Cursor CLI health check failed; attempting PR body generation anyway.",
    );
  }

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

  const CURSOR_TIMEOUT_MS = 60_000 * 5; // 5 minutes
  console.log(
    "[pr create] Asking Cursor to generate PR body (timeout %ds)...",
    CURSOR_TIMEOUT_MS / 1000,
  );
  try {
    const result = await execa(
      "cursor",
      [
        "agent",
        "--print",
        "--trust",
        "--mode",
        "ask",
        "--output-format",
        "text",
        prompt,
      ],
      { cwd: process.cwd(), timeout: CURSOR_TIMEOUT_MS },
    );
    const output = result.stdout.trim();
    if (!output) {
      throw new Error("Cursor CLI returned an empty PR description.");
    }
    console.log("[pr create] Cursor returned (%d chars).", output.length);
    return output;
  } catch (err) {
    const timedOut =
      err &&
      typeof err === "object" &&
      "timedOut" in err &&
      (err as { timedOut?: boolean }).timedOut;
    if (timedOut) {
      throw new Error(
        `Cursor agent did not respond within ${CURSOR_TIMEOUT_MS / 1000}s.`,
        { cause: err },
      );
    }
    throw err;
  }
};

const EDITOR_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const openEditorAndWait = async (filePath: string): Promise<void> => {
  const editor = process.env.VISUAL ?? process.env.EDITOR;
  console.log(
    "[pr create] Opening editor (timeout %d min)...",
    EDITOR_TIMEOUT_MS / 60_000,
  );
  const timeoutOpt = { stdio: "inherit" as const, timeout: EDITOR_TIMEOUT_MS };
  try {
    if (editor) {
      const escapedPath = filePath.replace(/"/g, '\\"');
      await execa("sh", ["-lc", `${editor} "${escapedPath}"`], timeoutOpt);
      console.log("[pr create] Editor closed.");
      return;
    }

    if (process.platform === "darwin") {
      await execa("open", ["-W", "-t", filePath], timeoutOpt);
      console.log("[pr create] Editor closed.");
      return;
    }

    if (process.platform === "win32") {
      await execa("notepad", [filePath], timeoutOpt);
      console.log("[pr create] Editor closed.");
      return;
    }

    await execa("vi", [filePath], timeoutOpt);
    console.log("[pr create] Editor closed.");
  } catch (err) {
    const timedOut =
      err &&
      typeof err === "object" &&
      "timedOut" in err &&
      (err as { timedOut?: boolean }).timedOut;
    if (timedOut) {
      throw new Error(
        `Editor did not complete within ${EDITOR_TIMEOUT_MS / 60_000} minutes. Save and close the file, then run pr create again.`,
        { cause: err },
      );
    }
    throw err;
  }
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
  const generatedBody = await generatePrBodyWithCursor({
    changeId,
    bookmark,
    title,
    template,
  });
  const tempDirectory = await mkdtemp(join(tmpdir(), "jj-scripts-pr-"));
  const bodyPath = join(tempDirectory, "pr-body.md");
  try {
    await writeFile(bodyPath, `${generatedBody}\n`, "utf8");
    await openEditorAndWait(bodyPath);
    const body = await readFile(bodyPath, "utf8");
    await createOneDraftPr(cwd, base, bookmark, body.trim(), {
      openInBrowser: true,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

type CreateOptions = PrOptions & { checkCursor?: boolean };

export const registerCreate = (pr: Command): void => {
  pr.command("create")
    .description(
      "Create a draft PR (or view existing one) for the change's bookmark",
    )
    .requiredOption("-c, --change-id <id>", "Change ID")
    .option(
      "--check-cursor",
      "Only run Cursor CLI health check and exit (for debugging)",
    )
    .action(async (opts: CreateOptions) => {
      if (opts.checkCursor) {
        const health = await checkCursorCli();
        console.log("[pr create] Health check done. ok=%s", health.ok);
        if (!health.ok && health.error) {
          console.log("[pr create] error=%s", health.error);
        }
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
