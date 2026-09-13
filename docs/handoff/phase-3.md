# Phase 3 handoff — Map view

Worker: Opus, 2026-09-13. Scope: Phase 3 only. Phase 4 (Focus/Outline) not started.

## What was built

### Server

- **`ThinkBenchWeb.UserSocket`** at `/socket` (websocket only), added to the endpoint.
  The LiveView socket declaration is untouched and the JS never connects to it. Each
  tab passes a `session_id` (kept in `sessionStorage`, so it survives reloads of that
  tab); the socket makes one up if it's missing. No auth, same as `/mcp`.
- **`ThinkBenchWeb.GraphChannel`** (`graph:main`):
  - **Join** subscribes to the graph topic and the looks topic *before* reading, so
    nothing is missed. It replies with `session_id`, `latest_seq`, `cards`, `links`,
    `regions` (via `Graph.read_board`, shaped by `ThinkBench.Mcp.Json`), the newest
    200 `events`, the `actors` (`{name, kind}`), and `look`.
  - **Pushes** `"event"` for every graph event: `{event, card | link | region}` holds
    the record's *current* state, re-read when the event is pushed. It's
    `{event, removed: {resource, id}}` when the record is gone. Archived cards arrive
    with `archived: true`. It also pushes `"look"` whenever an agent looks.
  - **Inbound writes** (`move_card`, `create_card`, `update_card`, `link`,
    `create_region`) run the *same generic actions the MCP tools run*
    (`ThinkBench.Mcp.Board` via `Ash.ActionInput.for_action |> Ash.run_action`), with
    `robert` as the Ash actor. That gives the UI the same casting, validation,
    placement and `{seq, record}` reply. Any `actor` param is dropped, so the UI can't
    write as someone else. Errors come back as `{:error, %{message}}`.
  - **`select`** `{card_ids}` calls `Graph.set_selection(session_id, ids)`. The client
    sends it on every selection change and on every (re)join, so MCP
    `read_selection` always matches what the tab shows.
- **The AI's last look: `ThinkBench.Graph.Look`**, a small Ash resource (table
  `looks`, one row per actor, upsert, not evented). It's persisted, so it survives
  page reloads and server restarts.
  - `Tools.read_board` and `Tools.changes_since` call `Graph.record_agent_look/2` with
    the `latest_seq` they return. That records the look only for `kind: :agent`
    actors (a human reading with `X-Actor: robert` isn't the AI looking) and
    broadcasts `{:look, look}` on `"graph:looks"`.
  - `Graph.latest_look/0` returns the most recent look by any agent. The join reply's
    `look` and the `"look"` push are `{actor, seq, at}`.
  - Recording is best effort and never fails the read.
  - Migration: `priv/repo/migrations/20260913035422_phase_3_looks.exs` (generated,
    reviewed).

### UI (`assets/js`)

- `board/useBoard.ts` joins the channel and reduces the join snapshot and pushes into
  state. It exposes `call(event, payload)` (a promise over the channel reply) and
  `moveLocal` (an optimistic position, undone if the move fails). Cards that arrive
  by a live `create` are flagged `entering` for 600ms.
- `board/MapView.tsx` is the React Flow map:
  - **Card nodes** follow the prototype's card: 220 wide, kind stripe, kind label
    (`· resolved`), creator name, title, body, tags, resolved dimming with
    strikethrough, selected ring, and the prototype's `pop` enter animation (off
    under `prefers-reduced-motion`).
  - **Region nodes** use the prototype's dashed adornment. They sit behind cards
    (`zIndex -1`), can't be selected or dragged, and ignore pointer events.
  - **Edges** are custom floating edges that go border to border, with the
    prototype's bezier, a mono label on a panel chip, and arrowheads (SVG markers
    filled from tokens). They switch to the accent colour when either end is selected.
  - **Drag** persists through `move_card` for every dragged card. **Click** selects;
    **shift or cmd click** adds to the selection. Dots background, zoom controls, and
    a one-time `fitView` after the first snapshot is measured.
  - A **+ Card** button or a double-click on empty map opens a small form that
    creates a card at that spot, acting as robert.
- `board/Inspector.tsx` is the right-hand pane, 320px:
  - **Selection.** For one card: kind and status, title, body, *created by* (name,
    creation seq, time), *last change* (actor, action, seq), position, links out and
    in (click to jump), tags, plus **Edit** (title, body, tags) and **Resolve** or
    **Reopen** (`update_card`). For two cards: a **Link** form (first-selected →
    second, swap button, type with the known types as suggestions). For one or more:
    **Group into a region** (`create_region` around the selected cards' measured
    boxes).
  - **Changes since AI last looked.** Shows "`<agent>` read up to seq N · time ago",
    then the events after that seq, newest first, with a sentence, actor, seq and
    time. The dot is accent for agents and yellow for humans.
  - **Tools the AI called.** Events whose actor is an agent, newest first, shown as
    `tool  summary` (create_card, update_card, move_card, archive_card, link, unlink,
    create_region).
- `App.tsx` lays out a top bar (brand, `seq` and card count, actor chips, live status,
  theme toggle ◐) with the board beside the inspector (`minmax(0,1fr) 320px`,
  stacking below 900px). There's no transcript pane.
- **Theme.** The prototype's tokens live in `assets/css/app.css`, on `:root`, under
  `prefers-color-scheme: dark`, and under `[data-theme]`. The existing root-layout
  script already stamps `data-theme` from the system setting and follows changes.
  The toggle writes the same `phx:theme` key. Tailwind handles layout; every colour
  is a token. Fonts (Instrument Sans, JetBrains Mono) load from Google Fonts in the
  root layout, with fallbacks.
- **React Flow CSS** is imported in `main.tsx`. esbuild emits it as
  `priv/static/assets/js/app.css`, which the root layout now links. `css.d.ts` lets
  tsc accept the side-effect import.
- `@types/phoenix` 1.6.7 was added as a dev dependency. It's the current release; the
  phoenix 1.8 JS package ships no types.

### Tests

- **`test/think_bench_web/channels/graph_channel_test.exs`**, 16 tests, with a new
  `test/support/channel_case.ex`:
  - The join payload: board, `latest_seq`, events, actors, look nil. A socket
    without a session id gets one.
  - Each inbound write (`move_card`, `create_card` with and without a position,
    `update_card`, `link`, `create_region`) produces a Graph event whose actor is
    robert, replies with `seq`, and pushes the matching `"event"` with the record.
  - An `actor` param can't override robert. Invalid input replies with an error,
    writes nothing and pushes nothing.
  - Pushes from other writers: an AI create, an unlink as `removed`, an archive as
    `archived`.
  - `select` stores the selection for the session, `read_selection` returns it,
    clearing works, and no events are written.
  - The AI's look: recorded and pushed on `read_board` and `changes_since`, returned
    on a fresh join, and not recorded for a human.
- **`mcp_test.exs`** gained one test: over the real HTTP transport, `read_board` and
  `changes_since` record the `latest_seq` they returned, and a write doesn't move it.

## Verified, and how

- `mix precommit` exits 0: 66 tests, compile with warnings as errors, formatting,
  unused-deps check, and `tsc --noEmit` all clean.
  - While the suite runs, one `Postgrex.Protocol … disconnected … client exited` log
    line can appear. It's a channel process from a finished test still re-reading a
    record for a push when the sandbox owner exits. No test fails from it.
- **Browser check with Claude in Chrome** against `mix phx.server` and the dev
  database (seeded board plus the Phase 2 check card):
  - **Visual spec.** I opened `prototype/index.html`. file:// was blocked by the
    extension, so I served it on a throwaway local `http.server` and compared the map,
    cards, labels, region and inspector side by side.
  - **The capture quirk.** This Chrome window runs at devicePixelRatio 2.2, and the
    extension's screenshots cropped the right and bottom of the real 1636×866
    viewport. I measured the real layout with JS (board 1270px, inspector 320px, no
    horizontal overflow). For the saved screenshots I injected a temporary style
    that sizes `#root` to the capture area and pressed React Flow's fit-view button.
    The layout is otherwise unchanged.
  - **`phase-3-board.png`**: the seeded board in dark (system) theme. Nine seeded
    cards plus the Phase 2 check card, all eight labelled links with arrowheads, the
    "Model hosting" region behind its cards, the two resolved cards dimmed and struck
    through, and the inspector. No console errors.
  - **`phase-3-selected.png`**: I clicked "Invert it: app is an MCP server…". The
    card got the accent ring, its three links turned accent, and the inspector showed
    kind and status, body, `created by claude-code · seq 12`, position, links out
    (resolves, depends-on), links in (challenges) and tags.
  - **Selection over MCP.** With that card selected, `curl /mcp read_selection`
    returned exactly its id and title. Later, after a shift-select of two cards, it
    returned both in selection order.
  - **The AI's last look.** `curl /mcp read_board` returned latest_seq 23, and the
    open page's inspector changed to "claude-code read up to seq 23 · just now"
    without a reload.
  - **`phase-3-live-mcp.png`**: `curl /mcp create_card` (objection, "Phase 3 check:
    live from MCP", seq 24) appeared on the map without a reload. A MutationObserver
    installed beforehand recorded the node mounting with class
    `tb-card k-objection enter` and computed `animation-name: tb-pop`. The inspector
    showed it as the 1 change since the AI looked, and at the top of Tools the AI
    called.
  - **Drag persists across reload.**
    - The extension's `left_click_drag` didn't drive React Flow's d3-drag in this
      window: it panned or selected text. So I dispatched real
      mousedown/mousemove/mouseup events on the card through the page, which is the
      same handler path as a mouse.
    - That produced seq 25 `move` by **robert** to (211, 185). `curl read_card`
      showed 211, 185, and after a full page reload the node was still at
      `translate(211px, 185px)`.
    - `curl changes_since 23` then showed both events, and the page updated to "read
      up to seq 25", with 0 unseen after a reload.
  - **Shift multi-select** (also via dispatched events with Shift held) selected two
    cards. The inspector showed both, plus the Link form ("Chat is primary…"
    follows-from "Board as cross-session memory") and the region form.
  - **`phase-3-light.png`**: light theme via `data-theme="light"` with a card
    selected. Tokens swap cleanly, including edges, labels and the inspector.
- **Not clicked through in the browser:** the Link, Draw region, Edit, Resolve and New
  card forms don't have their submit buttons exercised in the browser. Their server
  paths are covered by the channel tests, and the forms render (link and region forms
  seen in the multi-select check).
- **Dev database state after the check:** the "Phase 3 check: live from MCP" card
  (tag `phase-3-check`, seq 24) was moved back out of the way to (560, 650) with
  `move_card` as robert (seq 26). The Phase 2 check card is untouched. Archive either
  with `archive_card` if not wanted. `looks` holds one row for claude-code.

## Decisions the plan did not cover

1. **UI writes go through `ThinkBench.Mcp.Board`'s generic actions**, not straight to
   `ThinkBench.Graph`. It's literally the same path as MCP (DESIGN: "the UI calls the
   same actions the MCP tools expose"), including auto-placement. The price is that
   the channel depends on the Mcp domain, which now reads as "the tool surface" more
   than "MCP".
2. **Pushed events carry a snapshot of the record**, re-read at push time, rather
   than asking the client to replay event `changes`. Applying a snapshot is
   idempotent, so duplicates or races between join and subscribe are harmless. It
   costs one read per event per connected tab.
3. **Look = latest by any agent**, recorded only for agent actors. With a second
   agent (Phase 6 candidate) the inspector shows whichever agent looked most
   recently. Per-agent views would be a small change.
4. **The inspector feeds come from the newest 200 events sent on join**, plus live
   pushes (the client keeps 500). If the AI hasn't looked for more than 200 events,
   the "changes since" count undercounts. Fine at this scale; the server could send
   the exact count if it matters.
5. **Creation affordances** weren't specified: + Card and double-click for
   `create_card`, inspector forms for `update_card`, `link` and `create_region`. I
   kept them small so they don't pre-empt Phase 4 or 6 design. No link-by-dragging
   between handles.
6. **The tab bar shows only "Map".** Focus and Outline are Phase 4, so no placeholder
   tabs.
7. **`--term-you` light value is `#D9A514`** (the prototype's `#F2C94C` is for a dark
   terminal and barely shows on the light panel). The dark theme keeps `#F2C94C`.
   Terminal tokens that nothing uses were dropped.

## Not done / notes for the reviewer

- There's no UI for `archive_card` or `unlink`. They weren't in this phase's inbound
  list, and archived cards and unlinks pushed from MCP are handled.
- Edge labels can hide behind cards when two cards sit closer than the label width
  (the "follows-from" between "Voice capture" and "Phase 2 check"). The prototype has
  the same behaviour.
- The React Flow attribution is left visible.
- The Elixir 1.20 type warnings from deps still print while compiling, as before.

## Commands

```sh
docker compose up -d --wait
mix setup                 # or: mix ash.migrate (new looks table)
mix phx.server            # board at http://localhost:4000, MCP at /mcp
mix precommit

# Watch a card arrive live while the page is open
curl -s localhost:4000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_card","arguments":{"input":{"kind":"idea","title":"Hello from MCP"}}}}'

# What the UI has selected
curl -s localhost:4000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_selection","arguments":{"input":{}}}}'
```
