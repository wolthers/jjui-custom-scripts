import type { Command } from "commander";
import { registerCreate } from "./create.js";
import { registerView } from "./view.js";

export const registerPr = (program: Command): void => {
  const pr = program.command("pr").description("PR-related commands");
  registerView(pr);
  registerCreate(pr);
};
