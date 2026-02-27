import { Command } from "commander";
import { registerIntegrate } from "./integrate.js";
import { registerRestack } from "./restack.js";

export function registerStack(program: Command): void {
  const stack = program.command("stack").description("Stack operations");
  registerIntegrate(stack);
  registerRestack(stack);
}
