import { Command } from "commander";
import { jj } from "../../lib/jj.js";

export function registerIntegrate(stack: Command): void {
  stack
    .command("integrate")
    .description("Integrate change in a stack (rebase onto trunk, then merge)")
    .requiredOption("-r, --revision <rev>", "Revision to integrate")
    .action(async (opts: { revision: string }) => {
      const args = [
        "rebase",
        "-A",
        "trunk()",
        "-B",
        "merge",
        "-r",
        opts.revision,
      ];
      await jj(args);
    });
}
