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
