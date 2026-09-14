# Think Bench

A shared visual board beside a chat with AI. See `docs/DESIGN.md` for the what and
why, `docs/PLAN.md` for the phases, and `prototype/index.html` for the reference UI.

Stack: Elixir, Phoenix 1.8, Ash 3 (AshPostgres, AshPhoenix, AshAi), Postgres 17,
React 19 + TypeScript bundled by Phoenix's esbuild, Tailwind via Phoenix's tailwind.

## Requirements

- Elixir 1.20 / OTP 29 (via mise)
- Node.js (for `npm install` of the React dependencies)
- Docker (OrbStack) for Postgres

## Setup

```sh
open -a OrbStack            # if Docker is not already running
docker compose up -d --wait # Postgres 17 on localhost:5432 (postgres/postgres)
mix setup                   # deps, database, npm install, asset build, seeds
```

## Run

```sh
mix phx.server              # or: iex -S mix phx.server
```

Then open <http://localhost:4000>.

## Using it

1. **Start the server.** `docker compose up -d --wait`, then `mix phx.server`.
2. **Open the board** at <http://localhost:4000>. Map is the default view; Focus and
   Outline are the other tabs. Keep it beside your terminal.
3. **Open Claude Code in the repo root** (`claude`). `CLAUDE.md` points it at the
   `think-bench` skill (`skills/think-bench/SKILL.md`, linked into
   `.claude/skills/`) and at the MCP server in `.mcp.json`.
4. **Approve the MCP server.** The first time, Claude Code asks whether to trust the
   project's `think-bench` server; approve it. `/mcp` shows whether it's connected.
5. **Talk.** Claude reads the board first and summarises open questions, recent
   decisions and pins. As you think out loud it writes ideas, questions, decisions,
   sources and objections as cards, links each to what it came from, and resolves
   questions once you decide. Select cards on the board and say "this one" to point
   at them. Tell it "I changed the board" after moving or editing cards, and it catches
   up with `changes_since`.

### Optional: board-change hook

`.claude/hooks/think-bench-changes.sh` runs before each prompt. It asks the board for
events since the last prompt, and if someone other than `claude-code` changed
something, it adds a short summary to the prompt, so you don't have to say "I changed
the board". It's shipped disabled. To enable it for yourself, add this to
`.claude/settings.local.json` (not committed), or to `.claude/settings.json` to share
it:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/think-bench-changes.sh" }
        ]
      }
    ]
  }
}
```

Notes on the hook:

- **Needs `curl` and `jq`.** It prints nothing and never blocks a prompt if the server
  is down.
- **Where the cursor lives.** It keeps its cursor in
  `$TMPDIR/think-bench-hook-cursor-<hash>`. The first prompt only records the current
  head. Delete the file to reset.
- **Env overrides:** `THINK_BENCH_MCP_URL`, `THINK_BENCH_HOOK_CURSOR`.
- **It counts as a look.** It calls `changes_since` as `claude-code`, so the
  inspector's "changes since the AI last looked" resets on each prompt.

## MCP server (Claude Code)

The app serves an MCP server at <http://localhost:4000/mcp> (streamable HTTP, JSON
responses) whenever `mix phx.server` is running, in dev and prod. Tools: `read_board`,
`read_card`, `read_selection`, `changes_since`, `create_card`, `update_card`,
`move_card`, `archive_card`, `link`, `unlink`, `create_region`.

This repo ships a `.mcp.json`, so Claude Code started in the repo root offers the
`think-bench` server automatically (approve it once when asked). To add it by hand, or
for use from other directories:

```sh
claude mcp add --transport http think-bench http://localhost:4000/mcp            # this project only
claude mcp add --transport http --scope user think-bench http://localhost:4000/mcp  # every project
claude mcp list                                                                   # check it connects
```

**Actor.** Writes over MCP are recorded as `claude-code`. To write as another seeded
actor, send an `X-Actor` header (e.g. add `"headers": {"X-Actor": "robert"}` to the
server entry) or pass `actor` to a write tool. Unknown names are rejected.

**No authentication.** The endpoint accepts any request that reaches it. Think Bench is
a localhost tool: dev binds to 127.0.0.1. Browser requests from other origins are
refused for both `/mcp` (ash_ai Origin check) and `/socket` (`check_origin` on the
endpoint). Do not expose port 4000 to a network you do not trust without adding auth
in front of `/mcp` and `/socket`. A production bind past loopback requires
`PHX_BIND_ALL=true`.

## Checks

```sh
mix precommit
```

Runs, in order: `compile --warnings-as-errors`, `deps.unlock --check-unused`,
`format --check-formatted`, `test`, and `assets.typecheck` (`tsc --noEmit` in
`assets/`). Run `mix format` to fix formatting failures.

## Layout

- `assets/js/main.tsx` — esbuild entry, mounts React into `#root`
- `assets/js/App.tsx` — root component
- `assets/css/app.css` — Tailwind entry
- `lib/think_bench_web/controllers/page_html/home.html.heex` — the page at `/`
- `docker-compose.yml` — Postgres 17
