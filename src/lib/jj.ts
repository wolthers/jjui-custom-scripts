import { execa } from "execa";

export async function jj(
  args: string[],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  const result = await execa("jj", args, {
    cwd: options?.cwd ?? process.cwd(),
    reject: false,
  });
  if (result.failed) {
    throw new Error(
      `jj ${args.join(" ")} failed: ${result.stderr || result.stdout || result.message}`
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export async function jjCapture(
  args: string[],
  options?: { cwd?: string }
): Promise<string> {
  const { stdout } = await jj([...args, "--no-pager"], options);
  return stdout;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
