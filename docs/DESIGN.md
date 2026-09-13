# Think Bench — design brief

Started 2026-09-12 from a brainstorming session. The clickable prototype in
`prototype/index.html` is the reference for everything below; open it in a browser.

## The idea

A shared visual space beside a chat with AI. Like two people in a room with sticky
notes and a whiteboard, except the other people are agents. Built for one person
(Robert) to scratch a real itch: constant ideas, mostly software, thought through with
AI as a thinking partner rather than a task-doer.

## What it is, precisely

- **Chat is primary and turn-based.** The AI is not watching in real time. You talk,
  it responds, and it looks at the board when you tell it to or when it needs to.
- **The board is memory.** Ideas, decisions, questions, sources and objections become
  cards as the conversation produces them. Both of you move, group, link and edit.
- **Across sessions the board is what gets read first.** A new conversation starts by
  reading the board, not old transcripts.
- **Pointing.** Whatever is selected is attached to the next message. "This one"
  works.

## Settled decisions

1. **Chat lives in Claude Code, on the subscription.** The app never hosts the model.
   Headless Claude and the Agent SDK require an API key, and subscription OAuth is
   limited to Claude Code and claude.ai (Agent SDK quickstart, headless docs). So the
   app is an **MCP server plus a board UI**, and Claude Code is the client. Codex and
   Gemini CLI can connect the same way. No idle loop, no cadence budget, no Jido.
2. **Own it, don't bolt on.** Tinderbox + tbx proved the shape (notes with typed
   attributes and links, prototypes, agents-as-saved-queries, in-document AI memory,
   snapshot/diff as "what changed") but is closed source and at Eastgate's mercy.
   Lift the data model; build the app.
3. **Stack:** Elixir, Phoenix, Ash, AshPostgres, ash_events for the event log.
   Phoenix Channels so the board updates live when the AI writes. MCP server over the
   Ash actions (AshAI's or a standalone library). React 19, TypeScript,
   Tailwind. React Flow for the map view. Bundled by Phoenix's esbuild (no Vite). Ash resources are the single
   interface: the UI calls the same actions the MCP tools expose.
   Robert works in Elixir and Ash regularly, so this is a build, not a learning
   project.
   Rejected: rust-web-kit (SaaS starter; no realtime; no event log), TypeScript/Bun
   (fine, but Robert prefers Elixir), Inertia (page-based; the room is one live page).
4. **Event log is the source of truth.** Every change by anyone is an event with an
   actor, kind and payload. Cards and links are projections. "Changes since the AI
   last looked" is a query, not a diff of saves.
5. **One graph, not a board per project** (from TheBrain). Ideas connect across
   projects and across months.

## Card model (as prototyped, open to change)

Kinds: Idea, Question, Decision, Source, Objection. Each has title, body, tags,
status (open / resolved), position on the map, creator (you or a named agent) and
the turn it came from. A Decision that answers a Question resolves it.

Links are typed. Prototype types: answers, resolves, raised-by, follows-from,
depends-on, challenges, cites. The Focus view maps every type onto TheBrain's
grammar (parent / child / jump) with the label as a second layer.

Regions (dashed adornments) group a theme on the map.

## Views

**Decided 2026-09-12: Map is the primary view** and the one that opens by default.
Focus and Outline are secondary ways to move through the same graph.

- **Map:** freeform canvas, draggable cards, links drawn with labels, regions.
  For the messy early phase of an idea.
- **Focus:** TheBrain's Plex. One card centred, parents above, children below, jumps
  aside. Click a neighbour to re-centre. Trail of past centres. Pins. Scales past a
  few dozen cards where the map does not.
- **Outline:** cards grouped by kind with their links.

## Tool surface (the whole API the AI has)

read_board, read_selection, changes_since, create_card, update_card, move_card,
link, create_region. Plus a skill that tells the AI to keep the board
current after every meaningful exchange.

## Proposed vs direct writes

**Decided 2026-09-12: the AI writes directly.** No proposed state, no accept gate.
Provenance (who wrote each card) and the event log are the safety net. The
prototype's dashed "proposed" card is superseded.

## Open questions (see the prototype's "To decide together" pane)

1. Are five card kinds right?
3. Does a resolved question dim or archive?
4. Do regions earn their place, or are links and tags enough?
6. Is parent/child/jump the base link grammar, with labels on top?
7. Capture: how do ideas get onto the board away from the desk (voice, phone)?

## Things learned along the way

- TheBrain 15 ships "Cerebro AI" that works inside the graph. Same instinct.
- tbx (Rust CLI for Tinderbox) lives in `../tinderbox-cli`; its skill and design
  notes are worth rereading for conventions (in-document AI memory under /Hints/AI,
  provenance links, snapshot/diff).
- Jido (Elixir agent framework) is the right tool if autonomous agents ever come
  back; not needed for the chat-first design.
