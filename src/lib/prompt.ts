import { createInterface } from "node:readline";

/**
 * Prompt for a single line of input. Only use when process.stdin.isTTY is true.
 */
export function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
