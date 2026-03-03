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

/**
 * Prompt for yes/no confirmation. Only use when process.stdin.isTTY is true.
 * @param defaultYes - When true, pressing Enter accepts (Y/n); when false, Enter rejects (y/N).
 */
export function confirmLine(
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  return promptLine(`${question} ${hint}: `).then((answer) => {
    if (answer === "") return defaultYes;
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  });
}
