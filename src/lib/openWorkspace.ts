import { execa } from "execa";

/**
 * Spawn Cursor in a new window with the given workspace path.
 * Fire-and-forget: does not block; on failure logs a warning and does not throw.
 */
export function spawnWorkspaceOpener(
  workspacePath: string,
  options?: { noOpen?: boolean },
): void {
  if (options?.noOpen) return;

  const child = execa("cursor", ["-n", workspacePath], {
    detached: true,
    stdio: "ignore",
  });

  child.catch((err: unknown) => {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    console.warn("[pr checkout] Could not open Cursor: %s", message);
  });
}
