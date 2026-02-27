import type { Command } from "commander";
import { EXIT_GH, exitWith } from "../../lib/errors.js";
import type { PrOptions } from "./common.js";
import {
  resolveRequiredBookmark,
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
      const bookmark = await resolveRequiredBookmark(changeId);
      const wasOpened = await tryViewPrForChange(changeId, bookmark);
      if (!wasOpened) {
        exitWith(EXIT_GH, `No PR found for bookmark '${bookmark}'.`);
      }
    });
};
