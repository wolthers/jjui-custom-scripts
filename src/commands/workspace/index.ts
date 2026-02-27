import type { Command } from "commander";
import { registerWorkspaceAdd } from "./add.js";
import { registerWorkspaceRemove } from "./remove.js";

export const registerWorkspace = (program: Command): void => {
  const workspace = program.command("workspace").description("Manage jj workspaces");
  registerWorkspaceAdd(workspace);
  registerWorkspaceRemove(workspace);
};
