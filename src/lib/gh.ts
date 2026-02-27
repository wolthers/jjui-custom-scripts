import { execa } from "execa";

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
    throw new Error(
      `gh ${args.join(" ")} failed: ${result.stderr || result.stdout || result.message}`,
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
