import type { Command } from "commander";

export const registerPing = (program: Command): void => {
  program
    .command("ping")
    .description("Health check command")
    .action(() => {
      console.log("pong");
    });
};
