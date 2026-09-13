# Think Bench

A shared board of cards beside a chat with AI. The app is an MCP server plus a React
board; Claude Code is the chat. See `docs/DESIGN.md` and `docs/PLAN.md`.

## Using the board

- `.mcp.json` connects the `think-bench` MCP server at `http://localhost:4000/mcp`
  (needs `mix phx.server` running; approve the project server once when asked).
- Follow the skill in `skills/think-bench/SKILL.md` (also linked at
  `.claude/skills/think-bench` so Claude Code loads it as a project skill). In short:
  read the board at session start, write and link cards as ideas, questions,
  decisions, sources and objections come up, use `read_selection` for "this" and
  "that one", and call `changes_since` when the human says they changed the board.
- If the server isn't reachable, say so once and carry on without the board.

## Working on the code

Phoenix, Ash and usage rules are in `AGENTS.md`. Phases and the working agreement are
in `docs/PLAN.md`, and handoffs are in `docs/handoff/`.

```sh
docker compose up -d --wait   # Postgres 17 (open -a OrbStack first if Docker is down)
mix setup                     # deps, database, npm install, assets, seeds
mix phx.server                # board at http://localhost:4000, MCP at /mcp
mix precommit                 # compile (warnings as errors), unused deps, format, tests, tsc, vitest
mix test                      # Elixir tests only
mix assets.test               # vitest only
mix run priv/repo/seeds.exs   # idempotent sample graph
```
