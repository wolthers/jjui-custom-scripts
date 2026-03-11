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
- **`jj-scripts pr create --change-id <id>`** — Try to view an existing PR first; if none exists, generate a PR body with the configured agent (see [Agent configuration](#agent-configuration)), open it in your editor, then create a draft PR and open it. If no agent is available, uses the PR template and opens the editor.
- **`jj-scripts pr checkout [pr-number]`** — Check out a PR in a new jj workspace. Fetches the latest from git, creates a full workspace (`.env*`, direnv, registry), and runs `jj checkout <branch>@origin` in it, then opens the workspace in Cursor in a new window. If `pr-number` is omitted and stdin is a TTY, prompts for it. Optionally pass `--change-id` to resolve the PR from the change's bookmark; use `--no-open` to skip opening Cursor.
- **`jj-scripts pr graph [-o file.png]`** — Build the branch stack graph from current main (or dev) only and output DOT; with `-o`/`--out`, render to PNG (requires `dot` on PATH).
- **`jj-scripts pr sync [-y|--yes]`** — Sync PRs to the branch stack: ensure a PR exists for each branch (create if missing, with prompt unless `--yes`), update base branch when the stack changed, and add/update “part of a stack” comments on each PR.
- **`jj-scripts stack integrate -r <rev>`** — Rebase the given revision onto `trunk()` then merge (integrate into a mega merge).
- **`jj-scripts stack restack`** — Run `jj simplify-parents` then rebase mutable roots onto `trunk()`.
- **`jj-scripts workspace add [destination] [--name <name>] [--prefix <prefix>] [-r <rev>]`** — Create a new jj workspace and prepare it (copy `.env*`, run `direnv allow`). The new workspace path is a **sibling** of the repo root. If `destination` is omitted and stdin is a TTY, prompts for a name (prefixed with `workspace-`). Does not run an agent; use `ai-implement` for that.
- **`jj-scripts ai-implement [destination] [options]`** — Create a workspace (same as `workspace add`), then launch the agent **in plan mode in the foreground**. You describe your task directly in the agent session — no editor step. The agent owns this terminal tab until it exits. When done, cherry-pick commits from the agent workspace into your main working dir.
- **`jj-scripts workspace list [--registry-only]`** — List jj workspaces. By default runs `jj workspace list`; use `--registry-only` for one name per line from the CLI registry. Before listing, stale registry entries are removed with warnings (missing folder, or missing jj workspace).
- **`jj-scripts workspace remove [name] [--path <path>] [-y|--yes]`** — Forget a workspace and delete its folder. If `name` is omitted and stdin is a TTY, lists workspaces and prompts to pick by number or name. Prompts for confirmation before deleting unless `--yes` is passed. Also warns and prunes stale registry entries before selection.

Requires `jj` and `gh` on your PATH.

## Agent configuration

Commands that use an AI agent (`pr create`, `pr sync`, `ai-implement`) resolve the agent in this order:

1. **`JJ_SCRIPTS_AGENT_CMD`** — If set, used as the agent command (e.g. `cursor agent` or `agent`). The value is split on spaces; the first token is the executable, the rest are leading arguments.
2. **`agent`** — Cursor CLI when installed via `curl https://cursor.com/install`.
3. **`cursor agent`** — Legacy Cursor CLI.

If no agent is found, `pr create` and `pr sync` fall back to the PR template and your editor. `ai-implement` requires an agent and will error if none is available.

## Configuration

Your configs have been wired to invoke this CLI so you no longer need inline Lua or shell snippets.

- **jj** — `jj integrate` and `jj restack` run the CLI via `util exec`. Update the path in `~/.config/jj/config.toml` if you move the repo.
- **jjui** (v0.10+) — Add actions and bindings in `~/.config/jjui/config.toml` that call this CLI via `jj_interactive()`. Use the absolute path to `dist/cli.js`. For change-scoped commands, actions use `context.change_id()` in Lua.

Example jjui config for **jjui 0.10** (replace `PATH_TO` with the absolute path to your repo):

```toml
[[actions]]
name = "integrate"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "stack", "integrate", "-r", "@")
'''
[[bindings]]
action = "integrate"
seq = ["x", "i"]
scope = "revisions"
desc = "Integrate change in a stack"

[[actions]]
name = "restack"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "stack", "restack")
'''
[[bindings]]
action = "restack"
seq = ["x", "r"]
scope = "revisions"
desc = "Restack"

[[actions]]
name = "sync-prs"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "pr", "sync")
'''
[[bindings]]
action = "sync-prs"
seq = ["x", "p", "s"]
scope = "revisions"
desc = "Sync PRs"

[[actions]]
name = "view-pr"
lua = '''
local cid = context.change_id()
if not cid then flash("No revision selected"); return end
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "pr", "view", "--change-id", cid)
'''
[[bindings]]
action = "view-pr"
seq = ["x", "p", "v"]
scope = "revisions"
desc = "View PR"

[[actions]]
name = "create-pr"
lua = '''
local cid = context.change_id()
if not cid then flash("No revision selected"); return end
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "pr", "create", "--change-id", cid)
'''
[[bindings]]
action = "create-pr"
seq = ["x", "p", "c"]
scope = "revisions"
desc = "Create draft PR"

[[actions]]
name = "review-pr"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "pr", "checkout")
'''
[[bindings]]
action = "review-pr"
seq = ["x", "p", "r"]
scope = "revisions"
desc = "Review PR"

[[actions]]
name = "workspace-add"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "workspace", "add")
'''
[[bindings]]
action = "workspace-add"
seq = ["x", "w", "a"]
scope = "revisions"
desc = "Add workspace"

[[actions]]
name = "workspace-list"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "workspace", "list")
'''
[[bindings]]
action = "workspace-list"
seq = ["x", "w", "l"]
scope = "revisions"
desc = "List workspaces"

[[actions]]
name = "workspace-remove"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "workspace", "remove")
'''
[[bindings]]
action = "workspace-remove"
seq = ["x", "w", "r"]
scope = "revisions"
desc = "Remove workspace"

[[actions]]
name = "workspace-ai-implement"
lua = '''
jj_interactive("util", "exec", "--", "node", "PATH_TO/dist/cli.js", "ai-implement")
'''
[[bindings]]
action = "workspace-ai-implement"
seq = ["x", "w", "i"]
scope = "revisions"
desc = "Create workspace and run agent"
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
