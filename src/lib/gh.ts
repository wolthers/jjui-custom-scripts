import { execa } from "execa";
import { CliError, EXIT_GH } from "./errors.js";

export async function gh(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  const result = await execa("gh", args, {
    cwd: options?.cwd ?? process.cwd(),
    ...(options?.env && { env: options.env }),
    reject: false,
  });
  if (result.failed) {
    throw new CliError(
      `gh ${args.join(" ")} failed: ${result.stderr || result.stdout || result.message}`,
      EXIT_GH,
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
