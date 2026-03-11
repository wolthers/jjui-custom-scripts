import type { Command } from "commander";
import { registerWorkspaceAdd } from "./add.js";
import { registerWorkspaceList } from "./list.js";
import { registerWorkspaceOpen } from "./open.js";
import { registerWorkspaceRemove } from "./remove.js";

export const registerWorkspace = (program: Command): void => {
  const workspace = program
    .command("workspace")
    .description("Manage jj workspaces");
  registerWorkspaceAdd(workspace);
  registerWorkspaceList(workspace);
  registerWorkspaceOpen(workspace);
  registerWorkspaceRemove(workspace);
};
