import { Command } from "commander";
import { jj } from "../../lib/jj.js";

export function registerRestack(stack: Command): void {
  stack
    .command("restack")
    .description("Restack changes onto trunk (simplify-parents then rebase)")
    .action(async () => {
      await jj(["simplify-parents"]);
      await jj([
        "rebase",
        "-s",
        "roots(trunk()..) & mutable()",
        "-o",
        "trunk()",
      ]);
    });
}
