# Phase 2 handoff — MCP server

Worker: Opus, 2026-09-12. Scope: Phase 2 only. Phase 3 not started.

## What was built

- **MCP endpoint at `/mcp`** (dev and prod), served by ash_ai 1.0.3's
  `AshAi.Mcp.Router` over streamable HTTP with JSON responses. It's mounted in
  `lib/think_bench_web/router.ex` behind an `:mcp` pipeline, with server name
  "Think Bench" and server `instructions` that tell the model to start with
  `read_board` and keep `latest_seq`. There's no authentication; the README says so
  and explains why.
- **Domain `ThinkBench.Mcp`** (`lib/think_bench/mcp.ex`, added to `ash_domains`)
  uses the `AshAi` extension, and its `tools` block declares exactly the plan's 11
  tools: `read_board read_card read_selection changes_since create_card update_card
  move_card archive_card link unlink create_region`. Each tool is a generic action on
  `ThinkBench.Mcp.Board` (`lib/think_bench/mcp/board.ex`, no data layer). Those
  actions hold the model-facing descriptions and argument docs.
- **`ThinkBench.Mcp.Tools`** (`lib/think_bench/mcp/tools.ex`) implements the
  actions. Every tool goes through the `ThinkBench.Graph` domain and makes at most
  one write, so there are no outer transactions (Phase 1 caveat 4). Write tools
  return `{seq, card | link | region}`, taking `seq` from the record's
  `__metadata__.seq`.
- **`ThinkBench.Mcp.Json`** turns records into compact shapes for results. Actors
  appear by name. Timestamps, `created_by_id` and nil bodies are dropped. Event
  `changes` merge ash_events' `data` and `changed_attributes`, minus id and
  timestamps.
- **Actor resolution**:
  - `ThinkBenchWeb.Plugs.McpActor` sets the Ash actor from the `X-Actor` header,
    defaulting to `claude-code`. An unknown name gets HTTP 400 with a JSON-RPC error
    naming the known actors.
  - Each write tool also takes an optional `actor` argument, which wins over the
    header. An unknown name is a tool error (`isError: true`) and writes nothing.
  - `claude-code` is upserted if the database was never seeded, so the actor is
    never nil.
- **`ThinkBench.Graph.Placement`** handles `create_card` without x/y. It walks the
  grid around the most recently created non-archived card, with a 240×140 step (a
  220×120 card plus a 20px gutter). Cells are tried nearest first, preferring right
  and below over left and above, and the first cell that overlaps no card on the map
  wins. An empty board starts at (80, 80). Passing only one of x/y is an error.
- **`.mcp.json`** at the repo root points `think-bench` at
  `http://localhost:4000/mcp`. The README has a new "MCP server (Claude Code)"
  section covering `claude mcp add`, actors, and the no-auth note.
- **`req_llm` removed** from `mix.exs`. It is an optional dependency of ash_ai,
  needed only for ash_ai's LLM features (prompt actions, ToolLoop, embeddings), not
  for MCP. 11 packages left `mix.lock`.
- **Tests**:
  - `test/think_bench_web/mcp_test.exs` has 15 tests. Every call goes through the
    real HTTP JSON transport (`POST /mcp`, `initialize` then `tools/call` with the
    session id) against a database seeded by `priv/repo/seeds.exs`. They cover the
    handshake and tool list, each of the 11 tools, error cases, header and argument
    actors, and the plan's integration test (create a card, link it, and
    `changes_since` returns exactly those two events in order).
  - `test/think_bench/graph/placement_test.exs` has 3 unit tests for the grid walk.

## Verified, and how

- `mix precommit` exits 0: 49 tests pass, compile with warnings as errors, formatting,
  `deps.unlock --check-unused`, and `tsc` are all clean.
- **Plain HTTP** against `mix phx.server` with curl:
  - `initialize` returns 200 with an `mcp-session-id` and protocol `2025-06-18`.
  - `tools/list` lists the 11 tools with the descriptions shown in `board.ex`.
  - A duplicate `link` returns `isError` with `from_card_id: has already been taken`.
  - `X-Actor: nobody` returns 400
    `no actor named "nobody"; known actors: robert, claude-code`.
- **A real Claude Code session.** Claude Code 2.1.270, run headless from the repo
  root against the running dev server:

  ```sh
  claude -p --mcp-config .mcp.json --strict-mcp-config \
    --allowedTools 'mcp__think-bench__read_board,mcp__think-bench__create_card,mcp__think-bench__link,mcp__think-bench__changes_since' \
    --output-format stream-json --verbose "<prompt below>"
  ```

  Prompt: *Use only the think-bench MCP tools, in this order. 1) Call read_board;
  note latest_seq and how many cards there are. 2) Call create_card with kind idea,
  title 'Phase 2 check: MCP round trip', tags ['phase-2-check'], and no x/y. 3) Call
  link from the new card to the card titled 'Voice capture from my phone?' with type
  'follows-from'. 4) Call changes_since with the latest_seq from step 1. Then report
  briefly…*

  Transcript, extracted from the stream-json. The session init reported
  `mcp_servers: [{"name":"think-bench","status":"connected"}]`, and the session ran
  on Claude Code's default model, `claude-fable-5-1`. The read_board result is
  truncated here; the rest are verbatim.

  ```
  TOOL_USE mcp__think-bench__read_board {"input":{}}
  TOOL_RESULT {"links":[{"id":"187a2c1c-…","type":"raised-by",…}, … 8 links],"latest_seq":21,
               "cards":[{"id":"a4241c8a-…","status":"open","x":80,"y":80,"title":"Shared board beside chat",…}, … 9 cards],
               "regions":[…1 region]}

  TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"Phase 2 check: MCP round trip","tags":["phase-2-check"]}}
  TOOL_RESULT {"seq":22,"card":{"id":"957b9b97-165c-4c6f-9b53-7757b2168e76","status":"open","x":320,"y":650,
               "title":"Phase 2 check: MCP round trip","kind":"idea","tags":["phase-2-check"],"created_by":"claude-code"}}

  TOOL_USE mcp__think-bench__link {"input":{"from":"957b9b97-165c-4c6f-9b53-7757b2168e76","to":"5c40d2b8-872a-489e-82f9-fa4cd285a86a","type":"follows-from"}}
  TOOL_RESULT {"link":{"id":"39b30aab-b171-4d50-98c8-ca17b7492fbc","type":"follows-from",
               "to":"5c40d2b8-872a-489e-82f9-fa4cd285a86a","from":"957b9b97-165c-4c6f-9b53-7757b2168e76"},"seq":23}

  TOOL_USE mcp__think-bench__changes_since {"input":{"seq":21}}
  TOOL_RESULT {"events":[
    {"at":"2026-09-13T03:49:09.676009Z","action":"create","seq":22,"resource":"card","record_id":"957b9b97-165c-4c6f-9b53-7757b2168e76",
     "changes":{"kind":"idea","status":"open","tags":["phase-2-check"],"title":"Phase 2 check: MCP round trip","x":320,"y":650},"actor":"claude-code"},
    {"at":"2026-09-13T03:49:14.139771Z","action":"create","seq":23,"resource":"link","record_id":"39b30aab-b171-4d50-98c8-ca17b7492fbc",
     "changes":{"from_card_id":"957b9b97-165c-4c6f-9b53-7757b2168e76","to_card_id":"5c40d2b8-872a-489e-82f9-fa4cd285a86a","type":"follows-from"},"actor":"claude-code"}],
   "latest_seq":23,"has_more":false}
  ```

  The model's final report said: "read_board: latest_seq 21, 9 cards, 8 links, 1
  region. create_card: seq 22, placed at x 320, y 650. link: seq 23.
  changes_since(21): 2 events, latest_seq 23, has_more false." It also noted the
  card was placed 240px to the right of the newest card, "Voice capture from my
  phone?" at (80, 650). Before the calls it used ToolSearch to load the four tool
  schemas; that is Claude Code's deferred-tool loading, not something this server
  does.
- **Not verified in an interactive session.** `claude mcp list` in the repo shows
  `think-bench … ⏸ Pending approval`. Claude Code asks once before trusting a
  project `.mcp.json`, so an interactive session needs that one-time approval. I
  didn't click through it; the headless run used `--mcp-config` instead.
- The dev database now also holds the verification card "Phase 2 check: MCP round
  trip" (tag `phase-2-check`) and its link (seqs 22 and 23). Archive the card with
  `archive_card` if you don't want it on the map. Seeds are unaffected, because they
  match on seeded titles.

## Decisions the plan did not cover

1. **Tools are generic actions on a separate `ThinkBench.Mcp` domain**, not
   ash_ai's auto-generated CRUD tools on Card/Link/Region. The generated tools
   would expose filter/sort/limit parameters, return full records without `seq`,
   and could not do placement, actor fallback, or unlink by (from, to, type).
   Generic actions keep the Graph domain as the only write path and let each tool
   return exactly the planned shape.
2. **Arguments arrive under `input`.** ash_ai wraps every tool's parameters as
   `{"input": {...}}` in the JSON schema. Claude handled this without prompting (see
   the transcript). Overriding it would mean forking ash_ai's schema.
3. **`read_board` links are `{id, from, to, type}`** without `grammar`, to keep the
   whole-board read compact. `read_card` includes `grammar` and the other card's
   title.
4. **`changes_since` returns at most 500 events** and sets `has_more`. When
   truncated, `latest_seq` is the last returned event's seq, so calling again with it
   continues. The log head is read before the events, so `latest_seq` never runs
   ahead of what was returned.
5. **`update_card` with no fields is an error**, rather than a no-op write that would
   still record an event.
6. **The duplicate-link error** reads `from_card_id: has already been taken`,
   ash_ai's formatting of the identity violation. It's clear enough for a model; not
   customised.
7. **Unknown `X-Actor` is a transport-level 400**, since it's a client
   misconfiguration, while an unknown `actor` argument is an ordinary tool error the
   model can correct.
8. `AshAi.Mcp.Dev` (ash_ai's own dev-tools MCP at `/ash_ai/mcp`, added by the Phase 0
   installer in the endpoint's code-reloading block) is left as is. It's unrelated to
   the board tools.

## Caveats for the reviewer

- **A write's `seq` is not a safe cursor.** The plan says write results carry `seq`
  "so the AI can keep its cursor current without a second call". But if the human
  changed the board between the AI's last read and its write, jumping the cursor to
  the write's seq skips those human events. The tool descriptions therefore only say
  what `seq` is; the "remember latest_seq" guidance lives on `read_board` and
  `changes_since`. Phase 5's skill should say: advance the cursor only from
  `read_board` / `changes_since`, or from a write's seq only when it is exactly
  cursor + 1.
- **Placement isn't atomic.** Two concurrent `create_card` calls without x/y could
  pick the same cell. That's harmless for a turn-based single user, and it stays
  within one write per call.
- `update_card`, `move_card`, `archive_card` and `unlink` read the record and then
  write it: one read plus one write, with no outer transaction.
- An error struct that ash_ai has no `AshAi.ToToolError` impl for is reported to the
  model as "unexpected error occurred". This only matters for unanticipated failures;
  the cases covered in tests all read clearly.
- The Elixir 1.20 type warnings from deps (ash_ai, ash_json_api) still print while
  compiling, as noted in Phase 1.

## Commands

```sh
docker compose up -d --wait
mix setup                     # if not already set up
mix phx.server                # MCP at http://localhost:4000/mcp
mix precommit

# From Claude Code in this repo: approve the project's think-bench server when asked, or
claude mcp add --transport http think-bench http://localhost:4000/mcp

# Headless check, as in the transcript above
claude -p --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools 'mcp__think-bench__read_board' "Call read_board and summarise it."

# Raw JSON-RPC
curl -s localhost:4000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_board","arguments":{"input":{}}}}'
```
