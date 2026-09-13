# Phase 5 handoff: the AI's habits

Worker: Opus, 2026-09-13. Scope: Phase 5 only. Phase 6 not started. No application
code changed.

## What was built

- **`skills/think-bench/SKILL.md`** (157 lines). A Claude Code skill with frontmatter
  `name: think-bench` and a description that triggers on the board, cards, ideas,
  brainstorming, "check the board", "this one", "that one" and "these". It covers:
  - **Tools.** A tool table with input shapes (all under `input`) and return shapes.
  - **Session start.** Call `read_board`, set the cursor, then give a summary of up to
    five lines: open questions, recent decisions, pinned cards.
  - **Writing.** When to write each card kind. Write directly and never ask
    permission. Short titles, bodies of one to three sentences, reuse tags, one card
    per thought.
  - **Links.** A table of the seven link types, each with its from→to meaning and
    grammar (child for the six hierarchical types, jump for `cites`).
  - **Resolving.** Resolve a question only when the human decides: create the decision,
    link it with `answers` or `resolves`, then `update_card status: resolved`.
  - **Pointing.** Call `read_selection` for "this", "that one", "these", and ask if
    nothing is selected.
  - **Decisions.** Never invent one; recommendations are ideas.
  - **The cursor.** Advance it from `read_board` or `changes_since`, or from a write's
    `seq` only when it is exactly cursor + 1. This is Phase 2's caveat. Call
    `changes_since` when the human says they changed the board, or when the hook
    reports changes.
  - **Pins and regions.** Pin sparingly; create a region only when asked.
  - **A worked example turn.**
- **`.claude/skills/think-bench`** is a relative symlink to `../../skills/think-bench`,
  so Claude Code loads the skill as a project skill in any session in the repo. It
  worked headless; see the init line below.
- **`CLAUDE.md`** points at the skill and `.mcp.json`, and tells a session to use the
  think-bench tools and to say once if the server isn't reachable. It lists the dev
  commands and defers Phoenix and Ash rules to `AGENTS.md` without repeating them.
- **`.claude/hooks/think-bench-changes.sh`** (executable, shipped disabled; there is no
  `.claude/settings.json`).
  - **What it does.** On `UserPromptSubmit` it calls `/mcp` `changes_since` with the
    cursor kept in `$TMPDIR/think-bench-hook-cursor-<hash of project dir>`, then saves
    the new `latest_seq`.
  - **What it prints.** Only when there are events by actors other than `claude-code`.
    It prints a header saying how many changes there are, since which seq, and telling
    the AI to call `changes_since(<cursor>)`. Then up to 12 lines like
    `#30 robert created idea "…"`, `moved "…"`, `archived "…"`,
    `updated "…": pinned, status`, `create link "A" answers "B"`. Titles come from one
    `read_board include_archived` call, made only when there's something to print.
  - **First run.** It records the head (`changes_since` with a huge seq returns no
    events and the head as `latest_seq`) instead of replaying history.
  - **Failure.** It prints nothing and exits 0 if the server is down or `jq` is
    missing.
- **README.** A new "Using it" section: start the server, open the board, open Claude
  Code in the repo, approve the MCP server, talk. It is followed by "Optional:
  board-change hook", which gives the settings JSON to enable the hook (in
  `.claude/settings.local.json` or `.claude/settings.json`) and notes its requirements
  and behaviour.

## Verified, and how

- **`mix precommit` exits 0.** 70 Elixir tests and 14 vitest tests pass, with
  `tsc`, formatting, unused deps and compile warnings all clean. It ran after all
  files were written.
- **Hook, against `mix phx.server`,** with the cursor file pointed at the scratchpad:
  - First run: no output, cursor 29.
  - Second run: no output.
  - After a throwaway card was created, moved and archived as `robert` over MCP
    (seqs 30–32), it printed:
    ```
    Think Bench: 3 board change(s) by others since seq 29 (latest_seq 32). Call changes_since(29) for details; advance your cursor only as the think-bench skill says.
    - #30 robert created idea "Hook test card"
    - #31 robert moved "Hook test card"
    - #32 robert archived "Hook test card"
    ```
  - Next run: no output.
  - With `THINK_BENCH_MCP_URL=http://localhost:1/mcp`: no output, exit 0.

  **Not verified:** the hook enabled inside a real Claude Code session, where stdout
  would become prompt context. I ran it as a script only.

### Acceptance: a fresh Claude Code session

Claude Code headless, from the repo root, against the running dev server and dev
database. It was one session (`--session-id`, then `--resume` twice), so three turns
with shared context. `--setting-sources project,local` kept my user-level hooks and
CLAUDE.md out. The skill was not passed in; it loaded from `.claude/skills` and
CLAUDE.md.

```sh
claude -p --session-id "$SID" --setting-sources project,local \
  --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools 'mcp__think-bench,Skill,Read' --output-format stream-json --verbose "<turn 1>"
claude -p --resume "$SID" <same flags> "<turn 2>"
# set a selection (below)
claude -p --resume "$SID" <same flags> "<turn 3>"
```

Init line:
`mcp_servers: [{"name":"think-bench","status":"connected"}]`,
`skills: ["think-bench", …]`, `model: "claude-opus-5[1m]"`.

The transcript below is extracted from stream-json. ToolSearch calls (Claude Code's
deferred tool loading) are omitted. Results are trimmed to the fields that matter, ids
are shortened to 8 characters, and the reply text is abridged.

**Turn 1.** Human: *"Hi. New idea I want to think through: a morning digest. When I
open Claude Code for the first time each day, it tells me which open questions on the
board I haven't touched in a week, so ideas don't quietly rot. What do you think?"*

```
TOOL_USE Skill {"skill":"think-bench"}
TOOL_USE mcp__think-bench__read_board {"input":{}}
RESULT   {"latest_seq":32, "cards":[… 11 cards], "links":[… 10], "regions":[… 1]}
TOOL_USE Bash (grep lib/ for updated_at; ls .claude)        ← see note below
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"Morning digest of stale open questions","body":"On the first Claude Code session each day, list open questions nobody has touched in a week, so ideas don't quietly rot."}}
RESULT   {"seq":33,"card":{"id":"219f62fb","kind":"idea",…,"created_by":"claude-code"}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"question","title":"What counts as touching a question?","body":"An edit to the card only, or also a new link, an answer, or a move on the map? …"}}
RESULT   {"seq":34,"card":{"id":"4a332123","kind":"question","status":"open",…}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"objection","title":"A daily stale list turns into noise","body":"If the same questions show up every morning until someone acts, the digest gets skimmed and ignored. …"}}
RESULT   {"seq":35,"card":{"id":"76a0ca2d","kind":"objection",…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"219f62fb","to":"9a46dbcc" (seeded "Board as cross-session memory"),"type":"follows-from"}}
RESULT   {"seq":36,"link":{…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"4a332123","to":"219f62fb","type":"raised-by"}}
RESULT   {"seq":37,"link":{…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"76a0ca2d","to":"219f62fb","type":"challenges"}}
RESULT   {"seq":38,"link":{…}}
TOOL_USE Bash / Read (.claude/hooks/think-bench-changes.sh, lib/think_bench/mcp/json.ex)
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"Last touched comes from the event log","body":"…ignore map moves. Card updated_at can't do this…"}}
RESULT   {"seq":39,"card":{"id":"c521d67e",…}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"SessionStart hook with a daily stamp","body":"A hook like think-bench-changes.sh keeps a date file and runs only on the first session each day. …"}}
RESULT   {"seq":40,"card":{"id":"b9541636",…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"c521d67e","to":"4a332123","type":"answers"}}
RESULT   {"seq":41,…}
TOOL_USE mcp__think-bench__link {"input":{"from":"b9541636","to":"219f62fb","type":"follows-from"}}
RESULT   {"seq":42,…}
TEXT  **The board today:**
      - **Open questions:** "Voice capture from my phone?"
      - **Recent decisions:** "Chat is primary; board is memory" and "Invert it: app is an MCP server, Claude Code is the client". Both are pinned.
      …discussion: "touched" can't use updated_at; first-of-day belongs in a hook; noise is the real risk…
      What I'd want you to decide: should a map move count as a touch? Should parked questions leave the digest, and how?
      I added five cards: … linked to "Board as cross-session memory" …
```

**Turn 2.** Human: *"Decided: map moves don't count as a touch. A touch is any event
on the question itself or a link to it, straight from the event log like you said. I
haven't decided about parked questions yet."*

```
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"decision","title":"Touch = event on question or its links","body":"A question counts as touched by any event on the card itself or on a link pointing at it, read straight from the event log. Moving the card on the map does not count."}}
RESULT   {"seq":43,"card":{"id":"be8641a0","kind":"decision",…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"be8641a0","to":"4a332123","type":"resolves"}}
RESULT   {"seq":44,…}
TOOL_USE mcp__think-bench__link {"input":{"from":"be8641a0","to":"c521d67e","type":"follows-from"}}
RESULT   {"seq":45,…}
TOOL_USE mcp__think-bench__update_card {"input":{"id":"4a332123","status":"resolved"}}
RESULT   {"seq":46,"card":{"id":"4a332123","status":"resolved","title":"What counts as touching a question?",…}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"question","title":"Do links from the question count too?","body":"The decision covers links pointing at the question. A question's own outgoing links … are also events that involve it…"}}
RESULT   {"seq":47,"card":{"id":"ddf53892","kind":"question",…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"ddf53892","to":"be8641a0","type":"raised-by"}}
RESULT   {"seq":48,…}
TEXT  I've recorded that as a decision … The question "What counts as touching a question?" is now marked resolved. …
      One detail your wording leaves open: what about links going out from the question? … it's your call. I added it as a question card.
      "Parked questions" is still open. The noise objection is waiting on that decision.
```

**Selection.** Between turns 2 and 3 I set a selection through the Selection
resource's `:set` action, via `ThinkBench.Graph.set_selection("phase-5-check",
["76a0ca2d-…"])` in a separate `mix run --no-start` that started only the Repo.
`read_selection` over curl then returned the card "A daily stale list turns into
noise".

**Turn 3.** Human: *"I've selected one on the board. I think this one is the real
risk. A fix: the digest shows at most three questions, and it never repeats one two
days in a row. What do you make of that?"*

```
TOOL_USE mcp__think-bench__changes_since {"input":{"seq":48}}
RESULT   {"events":[],"latest_seq":48,"has_more":false}
TOOL_USE mcp__think-bench__read_selection {}
RESULT   {"card_ids":["76a0ca2d"],"cards":[{"id":"76a0ca2d","kind":"objection","title":"A daily stale list turns into noise","status":"open",…}]}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"Show at most three, no repeats on consecutive days","body":"The digest lists no more than three stale questions and skips any question it showed the day before. …"}}
RESULT   {"seq":49,"card":{"id":"530993ff",…}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"objection","title":"Skipping a day still repeats forever","body":"With three or fewer stale questions, the no-repeat rule just alternates … comes back every other day."}}
RESULT   {"seq":50,"card":{"id":"b8ab8fb8",…}}
TOOL_USE mcp__think-bench__create_card {"input":{"kind":"idea","title":"Back off each time a question is ignored","body":"Each time the digest shows a question and nobody touches it, wait longer before showing it again (1, 2, 4, 8 days). …"}}
RESULT   {"seq":51,"card":{"id":"51dbf8c0",…}}
TOOL_USE mcp__think-bench__link {"input":{"from":"530993ff","to":"76a0ca2d","type":"answers"}}
RESULT   {"seq":52,…}
TOOL_USE mcp__think-bench__link {"input":{"from":"b8ab8fb8","to":"530993ff","type":"challenges"}}
RESULT   {"seq":53,…}
TOOL_USE mcp__think-bench__link {"input":{"from":"51dbf8c0","to":"b8ab8fb8","type":"answers"}}
RESULT   {"seq":54,…}
TEXT  You've selected "A daily stale list turns into noise". I agree it's the real risk. …
      I added three cards:
      - Your fix, as an idea (answers the objection). It's not a decision yet, since you asked what I think.
      - An objection that skipping a day still repeats forever.
      - The back-off idea, which answers that objection.
```

**Result.** Ten cards and ten links, every card linked:

| Card | Links out |
| --- | --- |
| idea "Morning digest" | follows-from → seeded "Board as cross-session memory" |
| question "What counts as touching" | raised-by → the digest |
| objection "Stale list turns into noise" | challenges → the digest |
| idea "Last touched from the event log" | answers → the "touching" question |
| idea "SessionStart hook" | follows-from → the digest |
| decision "Touch = event on question or links" | resolves → the "touching" question; follows-from → the event-log idea |
| question "Do links from the question count" | raised-by → the decision |
| idea "At most three, no repeats" | answers → the noise objection |
| objection "Skipping a day repeats forever" | challenges → the "at most three" idea |
| idea "Back off" | answers → the "repeats forever" objection |

**How the session did against the skill:**
- **Session start.** It read the board and summarised open questions, decisions and
  pins, all correct against the board.
- **Decisions.** It resolved the question only after the human decided, and in turn 3
  wrote the human's proposal as an idea, not a decision.
- **Pointing.** It used `read_selection` for "this one", after checking
  `changes_since(48)`. Its cursor was 48: the `read_board` head of 32, stepped through
  its own consecutive writes up to 48.
- **Titles and bodies** stayed short.

**Where it fell short:**
- **The summary came late.** It sat inside the turn 1 reply rather than as the
  opening lines.
- **It explored code.** In turn 1 it spent several Bash and Read calls reading the
  repo (timestamps in `lib/`, the hook script, `json.ex`) before writing ideas that
  referred to them. That's reasonable for an idea about this very repo, but a
  thinking-partner session elsewhere wouldn't do it.
  - **Why Bash ran at all.** `Bash` wasn't in `--allowedTools`, yet it still ran. I
    believe the permission mode inherited from my shell allowed it; I didn't
    investigate.

**Cleanup.** After the run I archived all ten cards the session created, using
`archive_card` over curl as `claude-code` (seqs 55–64). `read_board` is back to the
same 11 cards as before the session (9 seeded, plus the Phase 2 and Phase 3 check
cards). I also cleared the `phase-5-check` selection to `[]`. The hook test card
(seqs 30–32) was archived during the hook check.

## Decisions the plan did not cover

1. **The skill is linked into `.claude/skills/`** rather than moved there, so the
   plan's path `skills/think-bench/SKILL.md` stays canonical. A session doesn't need
   `--append-system-prompt`.
2. **The hook ignores events by `claude-code`** when deciding whether to print, since
   those are the AI's own writes. It still advances its cursor past them.
3. **The hook is independent of the model's cursor.** It only reports and tells the
   model to call `changes_since(<hook cursor>)`. The model's own cursor rule stays as
   the skill describes.
4. **Side effect: the hook counts as a look.** It calls `changes_since` as
   `claude-code`, so if enabled, Phase 3's "changes since the AI last looked" in the
   inspector resets on every prompt. The README says so. Sending
   `X-Actor: robert` would avoid that (human looks aren't recorded), but it would
   misattribute the read, so I left it.
5. **`CLAUDE.md` stays short** and defers to `AGENTS.md` for Phoenix and Ash rules, as
   asked.

## Not done / notes for the reviewer

- **The hook wasn't exercised as an enabled hook** in a live Claude Code session (see
  above).
- **No interactive session.** The one-time approval prompt for the project MCP server
  is still unclicked, as in Phase 2; acceptance used `--mcp-config`.
- **Event seqs 30–64** are in the dev event log from this phase (hook test, session,
  archive). Cards are archived, not destroyed, so history remains.
- **`tr` is aliased to `trash` in this shell.** A `uuidgen | tr A-Z a-z` tried to
  trash files named `A-Z` and `a-z`, which didn't exist, so nothing was removed. Use
  `/usr/bin/tr`.

## Commands

```sh
docker compose up -d --wait
mix phx.server                     # board at http://localhost:4000, MCP at /mcp
claude                             # in the repo root; approve think-bench; talk
mix precommit

# Hook by hand (prints only when others changed the board since the last run)
echo '{}' | .claude/hooks/think-bench-changes.sh

# Headless acceptance, as above
claude -p --setting-sources project,local --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools 'mcp__think-bench,Skill,Read' "Hi, what's on the board?"
```
