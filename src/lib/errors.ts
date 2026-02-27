export const EXIT_NO_CHANGE = 2;
export const EXIT_NO_BOOKMARK = 3;
export const EXIT_JJ = 4;
export const EXIT_GH = 5;

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function exitWith(code: number, message: string): never {
  console.error(message);
  process.exit(code);
  throw new Error(message);
}
