import { execa } from "execa";

export const EDITOR_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Open a file in the user's editor and wait for it to be closed.
 * Uses VISUAL, EDITOR, or platform default (open -W on macOS, notepad on Windows, vi otherwise).
 */
export async function openEditorAndWait(
  filePath: string,
  options?: { timeoutMs?: number; logPrefix?: string },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? EDITOR_TIMEOUT_MS;
  const logPrefix = options?.logPrefix ?? "Editor";
  console.log(
    "[%s] Opening editor (timeout %d min)...",
    logPrefix,
    timeoutMs / 60_000,
  );
  const timeoutOpt = { stdio: "inherit" as const, timeout: timeoutMs };
  try {
    const editor = process.env.VISUAL ?? process.env.EDITOR;
    if (editor) {
      const escapedPath = filePath.replace(/"/g, '\\"');
      await execa("sh", ["-lc", `${editor} "${escapedPath}"`], timeoutOpt);
      console.log("[%s] Editor closed.", logPrefix);
      return;
    }

    if (process.platform === "darwin") {
      await execa("open", ["-W", "-t", filePath], timeoutOpt);
      console.log("[%s] Editor closed.", logPrefix);
      return;
    }

    if (process.platform === "win32") {
      await execa("notepad", [filePath], timeoutOpt);
      console.log("[%s] Editor closed.", logPrefix);
      return;
    }

    await execa("vi", [filePath], timeoutOpt);
    console.log("[%s] Editor closed.", logPrefix);
  } catch (err) {
    const timedOut =
      err &&
      typeof err === "object" &&
      "timedOut" in err &&
      (err as { timedOut?: boolean }).timedOut;
    if (timedOut) {
      throw new Error(
        `Editor did not complete within ${timeoutMs / 60_000} minutes. Save and close the file, then try again.`,
        { cause: err },
      );
    }
    throw err;
  }
}
