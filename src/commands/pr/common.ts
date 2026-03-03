import { EXIT_NO_BOOKMARK, exitWith } from "../../lib/errors.js";
import { gh } from "../../lib/gh.js";
import { jjCapture, splitLines } from "../../lib/jj.js";

export type PrOptions = { changeId: string };

const NO_BOOKMARK_MESSAGE = "No bookmark found for selected change";

const normalizeBookmark = (bookmark: string): string =>
  bookmark.replace(/@.*$/, "");

export const getFirstLine = (text: string): string | undefined =>
  splitLines(text)[0];

/** Root branch for stacks: dev if it exists, else main. */
export const resolveBaseBranch = async (cwd: string): Promise<string> => {
  try {
    await jjCapture(["log", "-r", "dev", "-T", "''", "--no-graph"], { cwd });
    return "dev";
  } catch {
    return "main";
  }
};

export type PrListItem = {
  number: number;
  headRefName: string;
  baseRefName: string;
  body: string | null;
  url: string | null;
};

export async function listOpenPrs(cwd: string): Promise<PrListItem[]> {
  const { stdout } = await gh(
    [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,headRefName,baseRefName,body,url",
    ],
    { cwd },
  );
  const raw = JSON.parse(stdout.trim()) as PrListItem[];
  return Array.isArray(raw) ? raw : [];
}

/** Parses the first (#number) PR reference from a commit/PR message. */
const PR_REF_RE = /\(#(\d+)\)/;
export const parsePrNumberFromMessage = (
  message: string,
): number | undefined => {
  const m = message.trim().match(PR_REF_RE);
  return m ? Number(m[1]) : undefined;
};

export const getChangeDescription = async (
  changeId: string,
): Promise<string> => {
  const raw = await jjCapture([
    "log",
    "-r",
    changeId,
    "-T",
    "description",
    "--no-graph",
  ]);
  return raw;
};

const parseFirstBookmarkLabel = (labels: string): string | undefined => {
  const firstLine = getFirstLine(labels) ?? "";
  const firstToken = firstLine.match(/^\s*([^\s,]+)/)?.[1] ?? "";
  const cleaned = firstToken.replace(/\*$/, "");
  return cleaned.length > 0 ? cleaned : undefined;
};

export const resolveBookmark = async (
  changeId: string,
): Promise<string | undefined> => {
  try {
    const revset = `roots(${changeId}:: & bookmarks())`;
    const output = await jjCapture([
      "bookmark",
      "list",
      "-r",
      revset,
      "-T",
      "name",
    ]);
    const firstBookmark = getFirstLine(output);
    return firstBookmark ? normalizeBookmark(firstBookmark) : undefined;
  } catch {
    const labels = await jjCapture([
      "log",
      "-r",
      changeId,
      "-T",
      "bookmarks",
      "--no-graph",
    ]);
    const firstLabel = parseFirstBookmarkLabel(labels);
    return firstLabel ? normalizeBookmark(firstLabel) : undefined;
  }
};

export const resolveRequiredBookmark = async (
  changeId: string,
): Promise<string> => {
  const bookmark = await resolveBookmark(changeId);
  if (!bookmark) {
    exitWith(EXIT_NO_BOOKMARK, NO_BOOKMARK_MESSAGE);
  }
  return bookmark;
};

const MISSING_PR_PATTERN =
  /no pull requests found|could not resolve to a pull request/i;

export const isMissingPrError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return MISSING_PR_PATTERN.test(error.message);
};

export const tryViewPr = async (bookmark: string): Promise<boolean> => {
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

export const tryViewPrByNumber = async (prNumber: number): Promise<boolean> => {
  try {
    await gh(["pr", "view", String(prNumber), "--web"]);
    return true;
  } catch (error: unknown) {
    if (isMissingPrError(error)) {
      return false;
    }
    throw error;
  }
};

/** Try view by bookmark; if no PR, try parsing (#number) from change description. */
export const tryViewPrForChange = async (
  changeId: string,
  bookmark: string,
): Promise<boolean> => {
  let opened = await tryViewPr(bookmark);
  if (!opened) {
    const description = await getChangeDescription(changeId);
    const prNumber = parsePrNumberFromMessage(description);
    if (prNumber !== undefined) {
      opened = await tryViewPrByNumber(prNumber);
    }
  }
  return opened;
};

export const withChangeId = (opts: PrOptions): string => opts.changeId.trim();
