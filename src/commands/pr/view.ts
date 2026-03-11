import type { Command } from "commander";
import { EXIT_GH, EXIT_NO_BOOKMARK, exitWith } from "../../lib/errors.js";
import type { PrOptions } from "./common.js";
import {
  getChangeDescription,
  parsePrNumberFromMessage,
  resolveBookmark,
  tryViewPrByNumber,
  tryViewPrForChange,
  withChangeId,
} from "./common.js";

export const registerView = (pr: Command): void => {
  pr.command("view")
    .alias("open-associated")
    .description("View the PR on GitHub for the change's bookmark")
    .requiredOption("-c, --change-id <id>", "Change ID")
    .action(async (opts: PrOptions) => {
      const changeId = withChangeId(opts);
      const bookmark = await resolveBookmark(changeId);

      if (bookmark) {
        console.log(
          "[pr view] Opening PR for bookmark %s in browser...",
          bookmark,
        );
        const wasOpened = await tryViewPrForChange(changeId, bookmark);
        if (!wasOpened) {
          exitWith(EXIT_GH, `No PR found for bookmark '${bookmark}'.`);
        }
        return;
      }

      // No local bookmark (e.g. commit is on a remote-tracking branch like main@origin).
      // Try to find the PR by (#number) in the commit description.
      const description = await getChangeDescription(changeId);
      const prNumber = parsePrNumberFromMessage(description);
      if (prNumber !== undefined) {
        console.log("[pr view] Opening PR #%d in browser...", prNumber);
        const wasOpened = await tryViewPrByNumber(prNumber);
        if (!wasOpened) {
          exitWith(EXIT_GH, `No PR found for #${prNumber}.`);
        }
        return;
      }

      exitWith(EXIT_NO_BOOKMARK, "No bookmark found for selected change");
    });
};
