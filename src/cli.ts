import { Command } from "commander";
import { registerPing } from "./commands/ping.js";
import { registerPr } from "./commands/pr/index.js";
import { registerStack } from "./commands/stack/index.js";
import { registerWorkspace } from "./commands/workspace/index.js";
import { CliError } from "./lib/errors.js";

const program = new Command();

program
  .name("jj-scripts")
  .description("CLI for jj/jjui workflows")
  .version("0.1.0");

registerPing(program);
registerPr(program);
registerStack(program);
registerWorkspace(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    console.error(err instanceof Error ? err.message : String(err));
    if (process.env.JJ_SCRIPTS_DEBUG === "1") {
      console.error(
        err instanceof Error && err.stack ? err.stack : String(err),
      );
    }
    process.exit(1);
  }
}

void main();
