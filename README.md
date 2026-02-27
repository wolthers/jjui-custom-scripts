# jjui-custom-scripts

CLI for [jj](https://github.com/jj-vcs/jj) / [jjui](https://github.com/idursun/jjui) workflows: open PRs, stack integrate/restack, and future workspace/PR-stack sync.

## Setup

```bash
pnpm install
pnpm build
```

Then point your jj/jjui config at the built binary (see [Configuration](#configuration)).

## Usage

- **`jj-scripts pr view --change-id <id>`** — Resolve the bookmark for the given change and open its PR on GitHub in the browser.
- **`jj-scripts pr create --change-id <id>`** — Try to view an existing PR first; if none exists, generate a PR body with Cursor CLI, open it in your editor, then create a draft PR and open it.
- **`jj-scripts pr view-or-create --change-id <id>`** — Same behavior as `pr create`, kept as an explicit workflow command.
- **`jj-scripts stack integrate -r <rev>`** — Rebase the given revision onto `trunk()` then merge (integrate into a mega merge).
- **`jj-scripts stack restack`** — Run `jj simplify-parents` then rebase mutable roots onto `trunk()`.
- **`jj-scripts workspace add <destination> [--name <name>]`** — Create a new jj workspace, copy relevant `.env*` files, run an initial setup prompt via Cursor Agent, open a task prompt file in Cursor (`--wait`), then optionally run Cursor Agent with that prompt.
- **`jj-scripts workspace remove <name> [--path <path>]`** — Forget the workspace with `jj workspace forget` and delete its folder (path from tracking metadata or `--path`).

Requires `jj` and `gh` on your PATH.

## Configuration

Your configs have been wired to invoke this CLI so you no longer need inline Lua or shell snippets.

- **jj** — `jj integrate` and `jj restack` run the CLI via `util exec`. Update the path in `~/.config/jj/config.toml` if you move the repo.
- **jjui** — Custom commands for “Integrate”, “View PR on GitHub”, “Create draft PR”, and “View or create PR” call the CLI. These commands use jjui’s `$change_id` placeholder when supported.

Use the **absolute path** to `dist/cli.js` in both configs, e.g.:

```toml
# Example: jj alias
integrate = ["util", "exec", "--", "node", "/path/to/jjui-custom-scripts/dist/cli.js", "stack", "integrate", "-r", "@"]
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
