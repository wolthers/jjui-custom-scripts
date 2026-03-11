# AGENTS.md

Guidance for AI coding agents working in this repository.

## Purpose and scope

- This repo is a TypeScript CLI for `jj`/`jjui` workflows (`pr`, `stack`, `workspace`, plus utility commands).
- Favor small, focused edits that preserve current command behavior unless the task explicitly asks for behavior changes.
- Keep changes easy to review: minimal surface area, clear naming, and consistent patterns with existing command files.

## Tech stack and environment

- Runtime: Node.js `>=22`
- Package manager: `pnpm` (lockfile is `pnpm-lock.yaml`)
- Build: `tsup`
- TypeScript mode: strict (`tsconfig.json`)
- Linting: `oxlint --deny-warnings`

## Project layout

- CLI entrypoint: `src/cli.ts`
- Command groups: `src/commands/<group>/index.ts`
- Individual commands: `src/commands/<group>/<command>.ts`
- Shared helpers:
  - `src/lib/jj.ts` for `jj` command execution and capture helpers
  - `src/lib/gh.ts` for GitHub CLI execution
  - `src/lib/errors.ts` for exit codes, `exitWith`, and `CliError`
  - `src/lib/prompt.ts` for TTY-safe `promptLine` and `confirmLine`
  - `src/lib/openWorkspace.ts` for `spawnWorkspaceOpener` (fire-and-forget `cursor -n <path>`)
  - `src/lib/editor.ts` for opening a file in the user's editor
  - `src/lib/agent.ts` for resolving and running the configured AI agent

## Error handling and exit behavior

- **CLI entrypoint** (`src/cli.ts`): Uses `parseAsync()` and a top-level `try/catch`. Async command work is awaited so the process does not exit before it completes.
- **User-facing failures in commands**: Use `exitWith(code, message)` for validation or missing-input cases (e.g. "destination required", "name required"). This prints to stderr and exits with the given code; tests intercept `process.exit` and assert on exit code and stderr.
- **Subprocess failures**: The `jj` and `gh` wrappers throw `CliError(message, EXIT_JJ)` or `EXIT_GH)` on failure. The top-level catch in `cli.ts` treats `CliError` by printing the message and calling `process.exit(err.exitCode)`. Do not throw generic `Error` from shared wrappers when the intent is a specific exit code.
- **Unexpected errors**: Non-`CliError` throws are caught in `cli.ts`: message is printed, then stack only if `JJ_SCRIPTS_DEBUG=1`, then `process.exit(1)`.
- **Interactive commands**: If a command prompts the user (e.g. confirmations or picking from a list), guard on TTY when no bypass flag is present: when `!process.stdin.isTTY` and the user did not pass the bypass (e.g. `--yes`), call `exitWith(1, "...")` with a message that tells them to use a TTY or pass the flag. Avoid hanging on readline in non-TTY environments.
- **Confirm prompts**: Use conventional prompts: `(Y/n)` when the default is yes, `(y/N)` when the default is no.

## Conventions to follow

- Internal TypeScript imports use `.js` extensions (NodeNext). Keep that style when adding imports.
- Prefer one command per file, then register it in the group's `index.ts`.
- If you add a new command group, register it in `src/cli.ts`.
- Use the shared wrappers (`jj`, `jjCapture`, `gh`) instead of calling `execa` directly for jj/gh operations.
- For user-facing hard failures needing specific exit codes, use `exitWith(...)` and existing constants from `src/lib/errors.ts`. In shared wrappers (`jj`, `gh`), throw `CliError(message, EXIT_JJ)` or `EXIT_GH` so the top-level handler can exit with the correct code.
- Keep option parsing explicit with local option types (see existing `*Options` type aliases in commands).
- Do not default revision/change identifiers to `@`; require explicit user input for revision-like selectors.
- Match existing command style:
  - `.description(...)` on each command
  - explicit required identifiers for revision-like selectors (no implicit `@`)
  - concise, actionable console messages

## Safety and security

- Do not introduce destructive filesystem behavior without guardrails.
  - Define a safe boundary (e.g. only under a given directory). Reject targets outside that boundary unless the user passes an explicit override (e.g. `--force`). For override, in a TTY require a confirmation string (e.g. type `yes`); in non-TTY, `--force` alone can suffice.
  - Never allow deleting `/`, the repo root, or the workspace root directory itself, even with `--force`.
- Do not commit or hardcode tokens/secrets.
- Keep token usage via environment variables (for example `GH_AUTH_TOKEN`, `GITHUB_TOKEN`).
- Avoid logging secret values.

## Workspace command expectations

- **Workspace root**: Workspaces are siblings of the repo. The workspace root is `dirname(repoRoot)` (one level up from the jj repo root). All relative paths for add/remove are resolved against this workspace root, not `process.cwd()`.
- `workspace add`:
  - Resolves relative `destination` as `resolve(dirname(repoRoot), destination)`; absolute destinations are used as-is.
  - Creates a workspace via `jj workspace add`, creates a bookmark, copies relevant `.env*` files (excluding template/sample variants), tracks path in the registry, then opens the workspace in Cursor (pass `--no-open` to skip).
- `workspace list`:
  - Lists workspaces from `jj workspace list`. In a TTY, pauses with "Press any key to continue" so output is visible when invoked from jjui.
  - Reconciles the registry against jj's workspace list on every run, pruning stale entries.
  - Empty check is against jj's list (not the registry), so untracked workspaces are still shown.
- `workspace open`:
  - Resolves workspace path from the registry first, then falls back to `jj workspace root --name=<name>`.
  - Opens the workspace in Cursor via `spawnWorkspaceOpener` (fire-and-forget).
  - Prompts to pick from the combined jj+registry list when name is omitted and stdin is a TTY.
- `workspace remove`:
  - All confirmation prompts and safety checks run **before** any destructive operation (`jj workspace forget`, `forgetWorkspaceRecord`, `rm`). Aborting at any prompt leaves the workspace fully intact.
  - Only allows deleting paths under the workspace root (and not the workspace root or repo root). Out-of-bound targets are refused unless `--force` is passed; with TTY and `--force`, the user must type `yes` to confirm.
  - Emits an advisory warning (no refusal) when the folder name does not start with `workspace-`.
- **Commander negatable booleans**: Use `.option("--no-<name>", …)` for flags that disable a default-on behaviour. Commander maps this to `opts.<name> = false` (not `opts.no<Name>`). Check with `opts.<name> !== false` or `opts.<name> === false` at the call site; do not pass a `noOpen`-style field to helpers — just guard the call.
- Workspace registry file path is `.jj/jj-scripts-workspaces.json` (schema version `1`).
- Shared workspace utilities (`parseWorkspaceNameLine`, `listJjWorkspaceNames`) live in `registry.ts` and are imported by all workspace commands.

## Documentation expectations

- If CLI behavior, flags, or defaults change, update `README.md` usage text in the same change.
- Keep examples aligned with actual command names and current behavior.

## Validation checklist for agents

After each turn, run:

1. `pnpm run format`
2. `pnpm run typecheck`
3. `pnpm run lint:fix`
4. `pnpm run test`

For command behavior changes, also run targeted command smoke checks via:

- `node dist/cli.js ping`
- `node dist/cli.js <group> <command> --help`

Note: do **not** use `pnpm dev -- <args>` for smoke checks — pnpm passes the `--` separator through to tsx, which causes Commander to treat everything after it as positional arguments rather than flags (e.g. `--help` runs the command instead of showing help).

## Change quality bar

- Don't preserve backwards compatibility - this tool is for the author only and not meant for distribution
- Keep error messages clear and specific enough for terminal users.
- Prefer incremental refactors over broad rewrites.
- Avoid unrelated cleanup in the same patch.
