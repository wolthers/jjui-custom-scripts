import { Command } from "commander";
import { registerPing } from "./commands/ping.js";
import { registerPr } from "./commands/pr/index.js";
import { registerStack } from "./commands/stack/index.js";
import { registerWorkspace } from "./commands/workspace/index.js";

const program = new Command();

program
  .name("jj-scripts")
  .description("CLI for jj/jjui workflows")
  .version("0.1.0");

registerPing(program);
registerPr(program);
registerStack(program);
registerWorkspace(program);

program.parse();
