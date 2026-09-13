# Think Bench — implementation plan

Companion to `DESIGN.md` (the what and why) and `prototype/index.html` (the reference
UI). This file is the how: phases, scope, acceptance criteria, and the working
agreement between the reviewer (Fable) and the worker (Opus).

## Status (2026-09-13)

Phases 0–5 built by Opus, reviewed by Fable, and pushed to `main`. Handoffs with
verification transcripts and screenshots are in `docs/handoff/`. Phase 6 is deferred
until Robert has used the tool for a week.

## Working agreement

- **One phase per worker session.** Each phase starts in a fresh Claude Code session
  with a fresh context. The worker reads `docs/DESIGN.md`, `docs/PLAN.md`, and the
  latest `docs/handoff/phase-N.md` before doing anything.
- **Scope is the phase, nothing more.** Do not start the next phase. Do not refactor
  outside the phase. If something in the plan is wrong or blocked, stop and say so in
  the handoff rather than improvising around it.
- **Verify before claiming done.** `mix precommit` (format, compile with warnings as
  errors, credo if present, tests) must pass. Anything UI-facing is checked in a
  browser, and the handoff says what was checked and how.
- **Commit at the end of the phase** with a message that says what the phase
  delivered. Do not push; the reviewer pushes after review.
- **Handoff note.** Each phase ends with `docs/handoff/phase-N.md`: what was built,
  what was verified and how, decisions made that the plan did not cover, anything
  left undone and why, and exact commands to run the result.
- **Never touch** Robert's real documents or other projects. Work only inside this
  repository.
- **Versions.** Verify on Hex before pinning. As of 2026-09-12: ash 3.33, ash_postgres
  2.13, ash_events 0.8, ash_ai 1.0, ash_phoenix 2.3, phoenix 1.8, igniter 0.8.
  Elixir 1.20 / OTP 29 is installed via mise.
- **Postgres.** Docker (OrbStack) with a `docker-compose.yml` in the repo. If Docker
  is not running, `open -a OrbStack` and wait for `docker ps` to succeed.

## Architecture in one paragraph

A Phoenix 1.8 app named `think_bench`. Ash 3 resources are the single interface:
Card, Link, Region, Actor, Event, Selection. Every write goes through an Ash action
and produces an Event row in the same transaction (ash_events), then broadcasts on
Phoenix PubSub. A Phoenix Channel streams events to the React UI. An MCP server
(ash_ai) exposes the same actions as tools to Claude Code, which is the chat client
on Robert's subscription. The app never calls a model itself. The UI is React 19 +
TypeScript bundled by Phoenix's esbuild, styled with Tailwind, map view via React
Flow. One graph, not a board per project.

## Data model

Ash domain `ThinkBench.Graph`.

**Actor** — who did something. `id`, `name` (unique, e.g. `robert`, `claude-code`),
`kind` (`:human | :agent`). Seeded with `robert` and `claude-code`.

**Card** — `id`, `kind` (`:idea | :question | :decision | :source | :objection`),
`title` (required), `body` (text), `tags` ({array, string}), `status`
(`:open | :resolved`, default open), `x`, `y` (integer, map position), `created_by`
(belongs_to Actor), `inserted_at`, `updated_at`. Soft delete via `archived_at`.

**Link** — `id`, `from_card_id`, `to_card_id`, `type` (string; known values
`answers resolves raised-by follows-from depends-on challenges cites`, others
allowed), `created_by`. Unique on (from, to, type). Calculation `grammar`:
`:hierarchy` for the known hierarchical types, `:jump` for `cites` and unknown.

**Region** — `id`, `title`, `x`, `y`, `w`, `h`, `created_by`.

**Event** — append-only, produced by ash_events for every create/update/destroy on
Card, Link, Region. Has a monotonically increasing `seq` (bigserial or the ash_events
equivalent), `actor_id`, `resource`, `action`, `record_id`, `data` (the changes),
`occurred_at`. Read action `since(seq)`.

**Selection** — what the human currently has selected in the UI. One row per
`session_id` (the browser's channel session). `card_ids` ({array, uuid}). Updated by
the UI over the channel; read by the MCP tool `read_selection`. Not evented.

Actor for a write is passed as the Ash actor. Channel writes use `robert`. MCP writes
use the actor named in the MCP request context, default `claude-code`.

## Tool surface (MCP, Phase 2)

| Tool | Backed by | Notes |
| --- | --- | --- |
| `read_board` | Card.read, Link.read, Region.read | Whole graph, compact JSON. Optional `kinds`, `tags`, `include_archived` |
| `read_card` | Card.by_id | One card with its links in and out |
| `read_selection` | Selection.current | Cards the human has selected right now |
| `changes_since` | Event.since | Events after `seq`, with a `latest_seq`; the tool description tells the AI to remember `latest_seq` |
| `create_card` | Card.create | kind, title, body, tags, x, y (x/y optional; server picks a free spot near the last card if absent) |
| `update_card` | Card.update | title, body, tags, status |
| `move_card` | Card.move | x, y |
| `archive_card` | Card.archive | soft delete |
| `link` | Link.create | from, to, type |
| `unlink` | Link.destroy | by id or (from, to, type) |
| `create_region` | Region.create | title, x, y, w, h |

Every tool result includes the `seq` of the event it produced, so the AI can keep its
cursor current without a second call.

## Phases

### Phase 0 — Scaffold

Goal: a running Phoenix + Ash app with Postgres, React, Tailwind, and CI-style checks,
and nothing else.

- `mix igniter.new think_bench --with phx.new --install ash,ash_postgres,ash_phoenix,ash_ai --no-live` or the equivalent sequence; app in the repo root (the repo already contains `docs/` and `prototype/`; keep them).
- `docker-compose.yml` with Postgres 17, `config/dev.exs` pointed at it, `mix setup` works.
- React 19 + TypeScript in `assets/`, bundled by the existing esbuild (add the React preset and a `tsconfig.json`; add a `mix assets.typecheck` alias running `tsc --noEmit`). One page at `/` that renders a React root saying "Think Bench" with Tailwind applied. React Flow installed but not yet used.
- `mix precommit` alias: `compile --warnings-as-errors`, `format --check-formatted`, `test`, `assets.typecheck`.
- README with setup and run commands.
- Acceptance: `mix setup && mix precommit` passes; `mix phx.server` serves the React page.

### Phase 1 — Graph domain and event log

Goal: the data model above, fully tested, with events and PubSub, no UI.

- Domain `ThinkBench.Graph` with Actor, Card, Link, Region, Event, Selection as specified.
- ash_events wired so every Card/Link/Region create, update, destroy produces an Event with the acting Actor. Verify the `seq` ordering is total.
- `Event.since/1` read action and `ThinkBench.Graph.changes_since/1` code interface.
- After each committed write, broadcast `{:event, %Event{}}` on `ThinkBench.PubSub` topic `"graph"`.
- Seeds: actors `robert` and `claude-code`; a small sample graph matching the prototype's first three turns (nine cards, links, one region) in `priv/repo/seeds.exs`, idempotent.
- Tests: create/update/move/archive card, link uniqueness, grammar calculation, events produced with correct seq and actor, `changes_since` returns only newer events, PubSub broadcast received.
- Acceptance: `mix precommit` passes; `mix run priv/repo/seeds.exs` twice leaves the same nine cards.

### Phase 2 — MCP server

Goal: Claude Code can work the board.

- ash_ai MCP endpoint mounted at `/mcp` (dev and prod), with the tools in the table above. Tool names and descriptions written for a model: short, imperative, say what to pass and what comes back. `changes_since` and `read_board` descriptions tell the AI to record `latest_seq`.
- Actor resolution: MCP requests act as `claude-code` unless a header or tool argument names another seeded actor.
- `create_card` without x/y places the card at a free spot (simple grid walk from the last created card).
- A `.mcp.json` at the repo root so opening Claude Code in the repo connects automatically, and a README section on `claude mcp add`.
- Tests: each tool through the MCP transport (HTTP JSON) against a seeded database; an integration test that creates a card, links it, reads changes_since, and sees both events.
- Manual verification in the handoff: from a real Claude Code session, `read_board`, `create_card`, `link`, `changes_since` all work, with the transcript pasted.
- Acceptance: the manual verification above, plus `mix precommit`.

### Phase 3 — Map view

Goal: the prototype's Map pane, live.

- Phoenix Channel `graph:main`: on join sends the full graph and `latest_seq`; pushes every Event afterwards; accepts `select` (card ids), `move_card`, `create_card`, `update_card`, `link`, `create_region` from the UI, acting as `robert`.
- React Flow map: cards as custom nodes matching the prototype's card design (kind stripe, kind label, creator, title, body, tags, resolved dimming); typed links as labelled edges; regions as group nodes behind cards; drag persists position via the channel; click selects and sends selection.
- Inspector pane (right): selected card with links in and out and provenance; "changes since the AI last looked" fed by events after the AI's last `changes_since` call (server records that seq); tool call log fed by events whose actor is an agent.
- Live: a card created over MCP appears on the map without reload, with the enter animation.
- Dark and light theme via the same tokens as the prototype.
- Acceptance: manual walk-through in the handoff with screenshots: create via MCP shows up live; drag persists across reload; selection made in the UI is returned by `read_selection` over MCP.

### Phase 4 — Focus and Outline views

Goal: the other two views from the prototype.

- Focus: selected card centred; parents, children, jumps from the link grammar; click to re-centre; trail of past centres (client state); pins (a `pinned` boolean on Card, exposed to MCP as part of update_card).
- Outline: cards grouped by kind with links, click selects.
- Tabs Map / Focus / Outline; Map default; selection shared across views.
- Acceptance: manual walk-through with screenshots.

### Phase 5 — The AI's habits

Goal: Claude Code maintains the board without being reminded.

- `skills/think-bench/SKILL.md`: at session start call `read_board` and summarise the open questions and recent decisions; after any exchange that produces an idea, decision, question, source or objection, write the card and link it to what it came from; when a decision answers a question, resolve the question; use `read_selection` whenever the human says "this", "that one", or similar; record `latest_seq` and call `changes_since` when the human says they changed the board.
- A `CLAUDE.md` in the repo root that points at the skill so any session in this repo gets it.
- Optional hook: `UserPromptSubmit` that injects `changes_since` output when there are unseen events. Document it; ship it disabled.
- Acceptance: a real session transcript in the handoff showing a fresh Claude Code session reading the board, holding a short conversation, and producing correctly linked cards.

### Phase 6 — Living with it

Deferred until Robert has used it for a week. Candidates: search, tag filter, archive view, markdown export of the graph, voice capture from phone, a second agent actor with a skeptic persona, Tinderbox import via tbx dump.

## Review checklist (reviewer, between phases)

- Does `mix precommit` pass on a clean checkout?
- Did the phase stay in scope?
- Do the tests test behaviour, not implementation?
- Are Ash actions the only write path? (No direct Repo writes outside seeds.)
- Does every write produce exactly one Event with the right actor?
- Is the handoff honest about what was not verified?
- Push to `origin/main` after review passes.
