import { execa } from "execa";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { EXIT_GH, EXIT_NO_BOOKMARK, exitWith } from "../../lib/errors.js";
import { gh } from "../../lib/gh.js";
import { jjCapture, splitLines } from "../../lib/jj.js";

type PrOptions = { changeId: string };

const NO_BOOKMARK_MESSAGE = "No bookmark found for selected change";
const MISSING_PR_PATTERN = /no pull requests found|could not resolve to a pull request/i;
const DEFAULT_PR_TEMPLATE = `## Summary

## Testing
`;

const normalizeBookmark = (bookmark: string): string => bookmark.replace(/@.*$/, "");

const getFirstLine = (text: string): string | undefined => splitLines(text)[0];

const parseFirstBookmarkLabel = (labels: string): string | undefined => {
  const firstLine = getFirstLine(labels) ?? "";
  const firstToken = firstLine.match(/^\s*([^\s,]+)/)?.[1] ?? "";
  const cleaned = firstToken.replace(/\*$/, "");
  return cleaned.length > 0 ? cleaned : undefined;
};

const resolveBookmark = async (changeId: string): Promise<string | undefined> => {
  try {
    const revset = `roots(${changeId}:: & bookmarks())`;
    const output = await jjCapture(["bookmark", "list", "-r", revset, "-T", "name"]);
    const firstBookmark = getFirstLine(output);
    return firstBookmark ? normalizeBookmark(firstBookmark) : undefined;
  } catch {
    const labels = await jjCapture(["log", "-r", changeId, "-T", "bookmarks", "--no-graph"]);
    const firstLabel = parseFirstBookmarkLabel(labels);
    return firstLabel ? normalizeBookmark(firstLabel) : undefined;
  }
};

const resolveRequiredBookmark = async (changeId: string): Promise<string> => {
  const bookmark = await resolveBookmark(changeId);
  if (!bookmark) {
    exitWith(EXIT_NO_BOOKMARK, NO_BOOKMARK_MESSAGE);
  }
  return bookmark;
};

const isMissingPrError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return MISSING_PR_PATTERN.test(error.message);
};

const tryViewPr = async (bookmark: string): Promise<boolean> => {
  try {
    await gh(["pr", "view", bookmark, "--web"]);
    return true;
  } catch (error: unknown) {
    if (isMissingPrError(error)) {
      return false;
    }
    throw error;
  }
};

const readPullRequestTemplate = async (cwd: string): Promise<string> => {
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

const getPrTitle = async (changeId: string, bookmark: string): Promise<string> => {
  try {
    const description = await jjCapture(["log", "-r", changeId, "-T", "description", "--no-graph"]);
    const firstLine = getFirstLine(description);
    if (firstLine) {
      return firstLine;
    }
  } catch {
    // Fallback to bookmark as title.
  }
  return bookmark;
};

const generatePrBodyWithCursor = async (args: {
  changeId: string;
  bookmark: string;
  title: string;
  template: string;
}): Promise<string> => {
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

  const result = await execa(
    "cursor",
    ["agent", "--print", "--mode", "ask", "--output-format", "text", prompt],
    { cwd: process.cwd() },
  );
  const output = result.stdout.trim();
  if (!output) {
    throw new Error("Cursor CLI returned an empty PR description.");
  }
  return output;
};

const openEditorAndWait = async (filePath: string): Promise<void> => {
  const editor = process.env.VISUAL ?? process.env.EDITOR;
  if (editor) {
    const escapedPath = filePath.replace(/"/g, '\\"');
    await execa("sh", ["-lc", `${editor} "${escapedPath}"`], { stdio: "inherit" });
    return;
  }

  if (process.platform === "darwin") {
    await execa("open", ["-W", "-t", filePath], { stdio: "inherit" });
    return;
  }

  if (process.platform === "win32") {
    await execa("notepad", [filePath], { stdio: "inherit" });
    return;
  }

  await execa("vi", [filePath], { stdio: "inherit" });
};

const createDraftPr = async (changeId: string, bookmark: string): Promise<void> => {
  const cwd = process.cwd();
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
    await gh(["pr", "create", "--draft", "--head", bookmark, "--title", title, "--body-file", bodyPath]);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  await gh(["pr", "view", bookmark, "--web"]);
};

const withChangeId = (opts: PrOptions): string => opts.changeId.trim();

export const registerView = (pr: Command): void => {
  pr.command("view")
    .alias("open-associated")
    .description("View the PR on GitHub for the change's bookmark")
    .requiredOption("-c, --change-id <id>", "Change ID")
    .action(async (opts: PrOptions) => {
      const changeId = withChangeId(opts);
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPr(bookmark);
      if (!wasOpened) {
        exitWith(EXIT_GH, `No PR found for bookmark '${bookmark}'.`);
      }
    });
};

export const registerCreate = (pr: Command): void => {
  pr.command("create")
    .description("Create a draft PR (or view existing one) for the change's bookmark")
    .requiredOption("-c, --change-id <id>", "Change ID")
    .action(async (opts: PrOptions) => {
      const changeId = withChangeId(opts);
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPr(bookmark);
      if (!wasOpened) {
        await createDraftPr(changeId, bookmark);
      }
    });
};

export const registerViewOrCreate = (pr: Command): void => {
  pr.command("view-or-create")
    .description("View existing PR or create draft PR for the change's bookmark")
    .requiredOption("-c, --change-id <id>", "Change ID")
    .action(async (opts: PrOptions) => {
      const changeId = withChangeId(opts);
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPr(bookmark);
      if (!wasOpened) {
        await createDraftPr(changeId, bookmark);
      }
    });
};
