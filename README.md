# jjui-custom-scripts

CLI for [jj](https://github.com/jj-vcs/jj) / [jjui](https://github.com/idursun/jjui) workflows: open PRs, stack integrate/restack, and future workspace/PR-stack sync.

## Setup

```bash
pnpm install
pnpm build
```

Then point your jj/jjui config at the built binary (see [Configuration](#configuration)).

## Usage

Prefix all commands with `jj-scripts` (e.g. `jj-scripts pr view --change-id @`). Requires `jj` and `gh` on your PATH.

### PR commands

| Command                      | Description                                                                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr view --change-id <id>`   | Open the PR for the change in the browser. Resolves from bookmark or `(#number)` in the change description.                                                                                                                                                     |
| `pr create --change-id <id>` | View existing PR if any; otherwise generate body with agent (see [Agent configuration](#agent-configuration)), edit, create draft PR. Falls back to template + editor if no agent.                                                                              |
| `pr checkout [pr-number]`    | Check out a PR in a new jj workspace: fetch, create workspace (`.env*`, direnv, registry), `jj edit <branch>@origin`, open in Cursor. Use `--change-id` to resolve from change; `--no-open` to skip opening Cursor. Prompts for `pr-number` if omitted and TTY. |
| `pr graph [-o file.png]`     | Output branch stack as DOT; with `-o`/`--out`, render to PNG (requires `dot` on PATH).                                                                                                                                                                          |
| `pr sync [-y\|--yes]`        | Ensure a PR per branch (create if missing), update base when stack changes, add/update "part of stack" comments. Prompt unless `--yes`.                                                                                                                         |

### Stack commands

| Command                    | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `stack integrate -r <rev>` | Rebase revision onto `trunk()` then merge (integrate into mega merge). |
| `stack restack`            | Run `jj simplify-parents` then rebase mutable roots onto `trunk()`.    |

### Workspace commands

| Command                                                                      | Description                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace add [destination] [--name <name>] [--prefix <prefix>] [-r <rev>]` | Create workspace sibling to repo root, copy `.env*`, open in Cursor. Prompts for destination if omitted and TTY. Pass `--no-open` to skip Cursor. Use `ai-implement` for agent-backed workspace.                                                                                                                             |
| `ai-implement [destination] [options]`                                       | Same as `workspace add`, then launch agent in plan mode in foreground. Describe task in agent session; when done, cherry-pick into main working dir.                                                                                                                                                                         |
| `workspace list [--registry-only]`                                           | List workspaces (`jj workspace list` by default). Use `--registry-only` for one name per line from registry. Prunes stale registry entries before listing. Exits with message when no jj workspaces exist (or when registry is empty under `--registry-only`). Pauses for keypress in a TTY so output stays visible in jjui. |
| `workspace open [name]`                                                      | Open a workspace in Cursor. Prompts to pick from list if name is omitted and TTY. Resolves path from registry, falls back to `jj workspace root`.                                                                                                                                                                            |
| `workspace remove [name] [--path <path>] [-y\|--yes]`                        | Delete workspace folder and forget from registry. Prompts for name and confirmation unless `--yes`. Prunes stale entries before selection.                                                                                                                                                                                   |

## Agent configuration

Commands that use an AI agent (`pr create`, `pr sync`, `ai-implement`) resolve the agent in this order:

| Priority | Source                 | Description                                                                                                                                     |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `JJ_SCRIPTS_AGENT_CMD` | If set, used as the agent command (e.g. `cursor agent` or `agent`). Value is split on spaces; first token is executable, rest are leading args. |
| 2        | `agent`                | Cursor CLI when installed via `curl https://cursor.com/install`.                                                                                |
| 3        | `cursor agent`         | Legacy Cursor CLI.                                                                                                                              |

If no agent is found, `pr create` and `pr sync` fall back to the PR template and your editor. `ai-implement` requires an agent and will error if none is available.

## Configuration

Your configs have been wired to invoke this CLI so you no longer need inline Lua or shell snippets.

| Tool              | Config                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **jj**            | `jj integrate` and `jj restack` run the CLI via `util exec`. Update the path in `~/.config/jj/config.toml` if you move the repo.                                                                                  |
| **jjui** (v0.10+) | Add actions and bindings in `~/.config/jjui/config.toml` that call this CLI via `jj_interactive()`. Use the absolute path to `dist/cli.js`. For change-scoped commands, actions use `context.change_id()` in Lua. |

Example jjui config for **jjui 0.10**:

```bash
cp examples/jjui-config.toml ~/.config/jjui/config.toml
sed -i '' 's|PATH_TO|/path/to/jj-scripts|g' ~/.config/jjui/config.toml  # macOS; Linux: sed -i
```

Or merge actions from [examples/jjui-config.toml](examples/jjui-config.toml) into your existing config. Replace `PATH_TO` with the absolute path to this repo.

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
