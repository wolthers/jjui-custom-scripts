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
  - `src/lib/errors.ts` for exit codes and `exitWith`

## Conventions to follow

- Internal TypeScript imports use `.js` extensions (NodeNext). Keep that style when adding imports.
- Prefer one command per file, then register it in the group's `index.ts`.
- If you add a new command group, register it in `src/cli.ts`.
- Use the shared wrappers (`jj`, `jjCapture`, `gh`) instead of calling `execa` directly for jj/gh operations.
- For user-facing hard failures needing specific exit codes, use `exitWith(...)` and existing constants from `src/lib/errors.ts`.
- Keep option parsing explicit with local option types (see existing `*Options` type aliases in commands).
- Do not default revision/change identifiers to `@`; require explicit user input for revision-like selectors.
- Match existing command style:
  - `.description(...)` on each command
  - explicit required identifiers for revision-like selectors (no implicit `@`)
  - concise, actionable console messages

## Safety and security

- Do not introduce destructive filesystem behavior without guardrails.
  - Example pattern: reject unsafe delete targets before recursive removal.
- Do not commit or hardcode tokens/secrets.
- Keep token usage via environment variables (for example `GH_AUTH_TOKEN`, `GITHUB_TOKEN`).
- Avoid logging secret values.

## Workspace command expectations

- `workspace add` currently:
  - creates a workspace via `jj workspace add`
  - copies relevant `.env*` files (excluding template/sample variants)
  - optionally runs Cursor setup/task flows
  - tracks workspace path metadata
- Workspace registry file path is `.jj/jj-scripts-workspaces.json` (schema version `1`).
- `workspace remove` should keep safety checks around deletion targets and workspace lookup behavior.

## Documentation expectations

- If CLI behavior, flags, or defaults change, update `README.md` usage text in the same change.
- Keep examples aligned with actual command names and current behavior.

## Validation checklist for agents

Run the smallest useful set based on your change:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm build`

For command behavior changes, also run targeted command smoke checks via:

- `pnpm dev -- ping`
- `pnpm dev -- <group> <command> --help`

## Change quality bar

- Don't preserve backwards compatibility - this tool is for the author only and not meant for distribution
- Keep error messages clear and specific enough for terminal users.
- Prefer incremental refactors over broad rewrites.
- Avoid unrelated cleanup in the same patch.
