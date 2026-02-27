import type { Command } from "commander";
import { registerCreate, registerView, registerViewOrCreate } from "./open-associated.js";

export const registerPr = (program: Command): void => {
  const pr = program.command("pr").description("PR-related commands");
  registerView(pr);
  registerCreate(pr);
  registerViewOrCreate(pr);
};
