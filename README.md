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
a localhost tool: dev binds to 127.0.0.1, and browser requests from non-localhost
origins are refused by ash_ai's Origin check. Do not expose port 4000 (or a prod
deployment) to a network you do not trust without adding auth in front of `/mcp`.

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
