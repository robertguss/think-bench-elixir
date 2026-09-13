---
name: think-bench
description: Keep the Think Bench board current while thinking with the human. Use whenever the think-bench MCP tools are available, at the start of a session, and whenever the conversation mentions the board, cards, ideas, brainstorming, questions, decisions, objections or sources, or the human says "check the board", "I moved some cards", "this one", "that one", "these".
---

# Think Bench

The board is a shared graph of cards joined by typed links. The human edits it in a
browser beside this chat; you edit it through the `think-bench` MCP tools. The board is
the memory between sessions, so keep it current without being asked.

## Tools

Every argument goes under `input`: `{"input": {...}}`. Ids are UUIDs. Write tools
return `{seq, card | link | region}`.

| Tool | Input | Returns |
| --- | --- | --- |
| `read_board` | `{}` or `{kinds?: [kind], tags?: [str], include_archived?: bool}` | `{latest_seq, cards, links, regions}` |
| `read_card` | `{id}` | card + `links_out` / `links_in` with titles |
| `read_selection` | `{}` | `{card_ids, cards}`, what the human has selected now |
| `changes_since` | `{seq}` | `{latest_seq, has_more, events}` |
| `create_card` | `{kind, title, body?, tags?, x?, y?}` | `{seq, card}` (omit x/y) |
| `update_card` | `{id, title?, body?, tags?, status?: "open"\|"resolved", pinned?: bool}` | `{seq, card}` |
| `move_card` | `{id, x, y}` | `{seq, card}` |
| `archive_card` | `{id}` | `{seq, card}` |
| `link` | `{from, to, type}` | `{seq, link}` |
| `unlink` | `{id}` or `{from, to, type}` | `{seq, link}` |
| `create_region` | `{title, x, y, w, h}` | `{seq, region}` |

`kind` is one of `idea`, `question`, `decision`, `source`, `objection`.
`tags` on `update_card` replaces the whole list. Don't pass `actor`; you write as
`claude-code`.

## 1. Session start

Call `read_board` before replying to the first message, even if the message isn't
about the board. Set your cursor to `latest_seq`. Then give the human a summary of at
most five lines:

- **Open questions:** `question` cards with status `open` (titles only).
- **Recent decisions:** the last few `decision` cards.
- **Pinned:** cards with `pinned: true`.

Skip any empty line. Don't list every card. Then answer what they asked.

## 2. Write cards as the conversation produces them

After every exchange, ask whether it produced any of these:

| Kind | When |
| --- | --- |
| `idea` | a proposal, a direction, a "what if" |
| `question` | something open that needs an answer, from either of you |
| `decision` | the human chose something (see rule 6) |
| `source` | a doc, link, paper, product or person worth citing |
| `objection` | a reason something might not work |

If it did, create the card and link it in the same turn, before or alongside your
reply. Don't ask permission, and don't announce a plan to write: write it, then
mention it in one short line ("Added a question and linked it to the idea.").

- **Title:** under about eight words, a noun phrase or the question itself.
- **Body:** one to three sentences, in plain words, saying why it matters. No
  transcript.
- **Tags:** reuse tags already on related cards (such as a project name). Don't make
  up new taxonomies.
- **One card per thought.** If a card for it already exists, `update_card` it; don't
  duplicate.
- Omit x/y. The server places the card next to the newest card.

## 3. Link every new card to what it came from

A link reads **from `type` to**. The new card is almost always `from`.

| Type | Use it when (from → to) | Grammar |
| --- | --- | --- |
| `answers` | a decision or idea answers a question | from is a **child** of to |
| `resolves` | a decision settles a question or objection | child |
| `raised-by` | a question or objection is raised by an idea or decision | child |
| `follows-from` | an idea or decision builds on an earlier card | child |
| `depends-on` | a card needs another to hold first | child |
| `challenges` | an objection or question pushes against an idea or decision | child |
| `cites` | any card points at a `source`, or a loose cross-reference | **jump** (sideways) |

"Child" means the Focus view shows `from` below `to`, and `to` above `from` as a
parent. Jumps sit to the side. Pick the most specific type. Use `cites` for "related",
not a hierarchical type. A card with no link is almost always a mistake, unless it
starts a brand-new thread.

## 4. Resolve questions

When the human makes a decision that answers an open question:

1. `create_card` the decision.
2. `link` decision → question with `answers`, or `resolves` if it closes the matter.
3. `update_card` the question with `status: "resolved"`.

Do the same for an objection the decision settles. Don't resolve a question just
because you suggested an answer; it's resolved when the human decides.

## 5. Pointing: "this", "that one", "these"

Whenever the human refers to cards without naming them ("this", "that one", "these",
"the one I selected", "what about this?"), call `read_selection` first and work on
those cards. If it's empty, say nothing is selected and ask which card they mean. Don't
guess from titles.

## 6. Never invent decisions

A `decision` card records something the human chose. If you recommend something,
write it as an `idea` (or put it in your reply), not as a decision. When the human
says "let's go with X", "yes, do that" or "decided", that's a decision. If you aren't
sure, it's an idea or a question.

Likewise, don't archive, retitle or rewrite cards the human created unless they asked.

## 7. The cursor

Keep a cursor: the seq up to which you have seen the board.

- **Set it** from `latest_seq` returned by `read_board` or `changes_since`.
- **Advance it after your own write** only when the write's `seq` is exactly
  `cursor + 1`. Then nothing happened between your last look and your write.
- **If the write's seq is higher,** leave the cursor where it is. Someone else
  changed the board in between, and jumping ahead would skip their events. Call
  `changes_since` with the cursor before you next rely on the board.
- If `changes_since` returns `has_more: true`, call again with its `latest_seq`.

Call `changes_since(cursor)` when:

- the human says they changed, moved, added, edited, linked or tidied the board
  ("I moved some cards", "check the board", "I've added a few");
- a hook message says there are unseen board changes;
- you are about to link to or update cards you haven't seen in a while.

Summarise what they changed in a line or two, then act on it. Events with actor
`robert` are the human's; `claude-code` are yours.

## 8. Pins and regions

Pin (`update_card pinned: true`) only when the human asks, or for the one or two
cards that anchor the whole session. Leave pins alone otherwise. Create a region only
when the human asks to group a theme.

## Example turn

Human: "What if the board could take voice notes from my phone?"

1. `create_card {kind: "idea", title: "Voice notes from phone", body: "Capture ideas away from the desk by speaking; they land on the board as idea cards.", tags: ["capture"]}` → `{seq: 41, card: {id: "I"}}`
2. The board has an open question "How do ideas get onto the board away from the desk?" (id `Q`): `link {from: "I", to: "Q", type: "answers"}` → seq 42.
3. Your reply discusses it, and you note a problem (transcription needs a model; the app never hosts one):
   `create_card {kind: "objection", title: "Transcription needs a model", body: "The app never calls a model, so something else must turn speech into text."}` → id `O`, then `link {from: "O", to: "I", type: "challenges"}`.
4. The cursor was 40, and the writes returned 41, 42, 43, 44 in order, so it's now 44.
5. Reply, ending with one line: "Added the idea (answers the capture question) and an objection."

Don't resolve `Q`. The human hasn't decided.
