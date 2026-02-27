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
import { jjCapture } from "../../lib/jj.js";
import type { PrOptions } from "./common.js";
import {
  getFirstLine,
  resolveRequiredBookmark,
  tryViewPrForChange,
  withChangeId,
} from "./common.js";

const DEFAULT_PR_TEMPLATE = `## Summary

## Testing
`;

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

const getPrTitle = async (
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
    await execa("sh", ["-lc", `${editor} "${escapedPath}"`], {
      stdio: "inherit",
    });
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

export const createDraftPr = async (
  changeId: string,
  bookmark: string,
): Promise<void> => {
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
    await gh([
      "pr",
      "create",
      "--draft",
      "--head",
      bookmark,
      "--title",
      title,
      "--body-file",
      bodyPath,
    ]);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  await gh(["pr", "view", bookmark, "--web"]);
};

export const registerCreate = (pr: Command): void => {
  pr.command("create")
    .description(
      "Create a draft PR (or view existing one) for the change's bookmark",
    )
    .requiredOption("-c, --change-id <id>", "Change ID")
    .action(async (opts: PrOptions) => {
      const changeId = withChangeId(opts);
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPrForChange(changeId, bookmark);
      if (!wasOpened) {
        await createDraftPr(changeId, bookmark);
      }
    });
};
