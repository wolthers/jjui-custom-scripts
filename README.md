# jjui-custom-scripts

CLI for [jj](https://github.com/jj-vcs/jj) / [jjui](https://github.com/idursun/jjui) workflows: open PRs, stack integrate/restack, and future workspace/PR-stack sync.

## Setup

```bash
pnpm install
pnpm build
```

Then point your jj/jjui config at the built binary (see [Configuration](#configuration)).

## Usage

- **`jj-scripts pr view --change-id <id>`** — Resolve the bookmark for the given change and open its PR on GitHub in the browser. If the bookmark has no PR, parses a `(#number)` reference from the change description and opens that PR by number.
- **`jj-scripts pr create --change-id <id>`** — Try to view an existing PR first; if none exists, generate a PR body with Cursor CLI, open it in your editor, then create a draft PR and open it.
- **`jj-scripts pr graph [-o file.png]`** — Build the branch stack graph from current main (or dev) only and output DOT; with `-o`/`--out`, render to PNG (requires `dot` on PATH).
- **`jj-scripts pr sync [-y|--yes]`** — Sync PRs to the branch stack: ensure a PR exists for each branch (create if missing, with prompt unless `--yes`), update base branch when the stack changed, and add/update “part of a stack” comments on each PR.
- **`jj-scripts stack integrate -r <rev>`** — Rebase the given revision onto `trunk()` then merge (integrate into a mega merge).
- **`jj-scripts stack restack`** — Run `jj simplify-parents` then rebase mutable roots onto `trunk()`.
- **`jj-scripts workspace add [destination] [--name <name>] [--prefix <prefix>] [-r <rev>]`** — Create a new jj workspace. The new workspace path is a **sibling** of the current directory (e.g. from `web-main` you get `../workspace-foo`). If `destination` is omitted and stdin is a TTY, prompts for a name (prefixed with `workspace-`). Then: copy `.env*`, run Cursor setup agent, open task prompt, etc.
- **`jj-scripts workspace list`** — List registered workspace names (one per line).
- **`jj-scripts workspace remove [name] [--path <path>]`** — Forget a workspace and delete its folder. If `name` is omitted and stdin is a TTY, lists workspaces and prompts to pick by number or name.

Requires `jj` and `gh` on your PATH.

## Configuration

Your configs have been wired to invoke this CLI so you no longer need inline Lua or shell snippets.

- **jj** — `jj integrate` and `jj restack` run the CLI via `util exec`. Update the path in `~/.config/jj/config.toml` if you move the repo.
- **jjui** — Add custom commands in `~/.config/jjui/config.toml` that call this CLI with the absolute path to `dist/cli.js`. Use jjui’s `$change_id` placeholder for change-scoped commands.

Example jjui custom commands (replace `PATH_TO_JJ_SCRIPTS` with the repo path, e.g. `/Volumes/Work/github/jj-scripts`):

```toml
[custom_commands.integrate]
desc = "Integrate change in a stack"
key = ["i"]
args = ["util", "exec", "--", "node", "PATH_TO_JJ_SCRIPTS/dist/cli.js", "stack", "integrate", "-r", "@"]
show = "interactive"

[custom_commands.view-pr]
desc = "View PR on GitHub"
key = ["o"]
args = ["util", "exec", "--", "node", "PATH_TO_JJ_SCRIPTS/dist/cli.js", "pr", "view", "--change-id", "$change_id"]
show = "interactive"

[custom_commands.create-pr]
desc = "Create draft PR (or view existing)"
args = ["util", "exec", "--", "node", "PATH_TO_JJ_SCRIPTS/dist/cli.js", "pr", "create", "--change-id", "$change_id"]
show = "interactive"

# Workspace add: with show = "interactive" the CLI prompts for a name (prefixed with workspace-) when no destination is passed
[custom_commands.workspace-add]
desc = "Add jj workspace"
args = ["util", "exec", "--", "node", "PATH_TO_JJ_SCRIPTS/dist/cli.js", "workspace", "add"]
show = "interactive"

# Workspace remove: the CLI lists workspaces and prompts to pick one when no name is passed
[custom_commands.workspace-remove]
desc = "Remove jj workspace"
args = ["util", "exec", "--", "node", "PATH_TO_JJ_SCRIPTS/dist/cli.js", "workspace", "remove"]
show = "interactive"
```

## Adding a new command

1. **Add a command file** under `src/commands/<group>/<name>.ts` (e.g. `src/commands/workspace/add.ts`).
2. **Register it** in the group’s `src/commands/<group>/index.ts` and, if it’s a new group, register the group in `src/cli.ts`.
3. **Use shared helpers** — `jj()` / `jjCapture()` in `src/lib/jj.ts`, `gh()` in `src/lib/gh.ts`, and `exitWith()` from `src/lib/errors.ts` for consistent exit codes and messages.

One command per file keeps the codebase easy to extend.

## Testing

Run contract tests (no `jj`/`gh` required; mocks are used):

```bash
pnpm test
```

Watch mode for development:

```bash
pnpm test:watch
```

## Token and secret safety

- **Do not put GitHub (or other) tokens in config files.** Use environment variables (e.g. `GH_AUTH_TOKEN`, `GITHUB_TOKEN`) and pass them through your shell or jjui’s environment so the CLI or scripts can read them.
- For scripts that need a token (e.g. PR sync), invoke them with `--github-token "$GH_AUTH_TOKEN"` or similar, and set the env var in your profile or a secure helper, not in the repo or config.

## License

MIT
