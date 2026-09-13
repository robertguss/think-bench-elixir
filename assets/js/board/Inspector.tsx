import { useReactFlow } from "@xyflow/react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { describeEvent, describeTool, timeAgo, titleIndex } from "./describe"
import { CARD_WIDTH } from "./MapView"
import { parseTags } from "./NewCardForm"
import { LINK_TYPES, type Card, type GraphEvent } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

const FEED_LIMIT = 40
const REGION_PADDING = 24

type Props = {
  board: BoardState
  actions: BoardActions
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onError: (message: string) => void
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function Inspector({ board, actions, selectedIds, onSelect, onError }: Props) {
  const now = useNow()
  const titles = useMemo(() => titleIndex(board), [board.events, board.cards])
  const agents = useMemo(
    () => new Set(board.actors.filter((a) => a.kind === "agent").map((a) => a.name)),
    [board.actors],
  )
  const selected = selectedIds.map((id) => board.cards[id]).filter((c): c is Card => !!c)

  const lookSeq = board.look?.seq ?? 0
  const unseen = board.events.filter((e) => e.seq > lookSeq).reverse()
  const toolCalls = board.events.filter((e) => agents.has(e.actor)).reverse()

  return (
    <aside className="tb-inspector flex min-h-0 flex-col gap-2.5 overflow-auto" aria-label="Inspector">
      <section className="tb-pane">
        <h2>
          Selection <span className="n">{selected.length || "none"}</span>
        </h2>
        {selected.length === 0 && (
          <div className="tb-empty">
            Click a card. Whatever is selected is what the AI sees when you say “this one”.
          </div>
        )}
        {selected.length === 1 && (
          <SelectedCard
            key={selected[0].id}
            card={selected[0]}
            board={board}
            actions={actions}
            onSelect={onSelect}
            onError={onError}
            now={now}
          />
        )}
        {selected.length > 1 && (
          <div className="tb-multi">
            {selected.map((c) => (
              <button key={c.id} className="tb-row" onClick={() => onSelect([c.id])}>
                <i style={{ background: `var(--${c.kind})` }} />
                {c.title}
              </button>
            ))}
            {selected.length === 2 && (
              <LinkForm key={selected.map((c) => c.id).join()} from={selected[0]} to={selected[1]} actions={actions} onError={onError} />
            )}
          </div>
        )}
        {selected.length > 0 && <RegionForm cards={selected} actions={actions} onError={onError} />}
      </section>

      <section className="tb-pane">
        <h2>
          Changes since AI last looked <span className="n">{unseen.length}</span>
        </h2>
        <div className="tb-look">
          {board.look ? (
            <>
              {board.look.actor} read up to seq {board.look.seq} · {timeAgo(board.look.at, now)}
            </>
          ) : (
            "The AI hasn’t read the board yet."
          )}
        </div>
        <EventFeed events={unseen} titles={titles} agents={agents} now={now} empty="Nothing new since then." />
      </section>

      <section className="tb-pane">
        <h2>
          Tools the AI called <span className="n">{toolCalls.length}</span>
        </h2>
        {toolCalls.length === 0 ? (
          <div className="tb-empty">No agent writes yet.</div>
        ) : (
          <div className="tb-tools">
            {toolCalls.slice(0, FEED_LIMIT).map((e) => {
              const [tool, detail] = describeTool(e, titles)
              return (
                <div key={e.seq} title={`${e.actor} · seq ${e.seq} · ${new Date(e.at).toLocaleString()}`}>
                  <span className="t">{tool}</span>
                  <span className="d">{detail}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </aside>
  )
}

function EventFeed(props: {
  events: GraphEvent[]
  titles: Record<string, string>
  agents: Set<string>
  now: number
  empty: string
}) {
  const { events, titles, agents, now, empty } = props
  if (events.length === 0) return <div className="tb-empty">{empty}</div>
  return (
    <div className="tb-events">
      {events.slice(0, FEED_LIMIT).map((e) => (
        <div key={e.seq} className="ev">
          <i style={{ background: agents.has(e.actor) ? "var(--accent)" : "var(--term-you)" }} />
          <div>
            {describeEvent(e, titles)}
            <div className="who">
              {e.actor} · seq {e.seq} · {timeAgo(e.at, now)}
            </div>
          </div>
        </div>
      ))}
      {events.length > FEED_LIMIT && <div className="tb-empty">and {events.length - FEED_LIMIT} earlier</div>}
    </div>
  )
}

function SelectedCard(props: {
  card: Card
  board: BoardState
  actions: BoardActions
  onSelect: (ids: string[]) => void
  onError: (message: string) => void
  now: number
}) {
  const { card, board, actions, onSelect, onError, now } = props
  const [editing, setEditing] = useState(false)
  const links = Object.values(board.links)
  const out = links.filter((l) => l.from === card.id && board.cards[l.to])
  const into = links.filter((l) => l.to === card.id && board.cards[l.from])
  const history = board.events.filter((e) => e.resource === "card" && e.record_id === card.id)
  const created = history.find((e) => e.action === "create")
  const last = history.at(-1)

  const setStatus = (status: Card["status"]) =>
    actions.call("update_card", { id: card.id, status }).catch((e: Error) => onError(`Update failed: ${e.message}`))

  if (editing) return <EditCard card={card} actions={actions} onDone={() => setEditing(false)} onError={onError} />

  return (
    <div className="tb-sel">
      <div className="kindline" style={{ color: `var(--${card.kind})` }}>
        {card.kind.toUpperCase()} · {card.status}
      </div>
      <h3>{card.title}</h3>
      {card.body && <p>{card.body}</p>}
      <dl className="tb-kv">
        <dt>created by</dt>
        <dd>
          {card.created_by}
          {created && (
            <span className="mono">
              {" "}
              · seq {created.seq} · {timeAgo(created.at, now)}
            </span>
          )}
        </dd>
        {last && last !== created && (
          <>
            <dt>last change</dt>
            <dd>
              {last.actor} {last.action}
              <span className="mono">
                {" "}
                · seq {last.seq} · {timeAgo(last.at, now)}
              </span>
            </dd>
          </>
        )}
        <dt>position</dt>
        <dd className="mono">
          {card.x}, {card.y}
        </dd>
        {out.length > 0 && (
          <>
            <dt>links out</dt>
            <dd>
              {out.map((l) => (
                <button key={l.id} className="lk" onClick={() => onSelect([l.to])}>
                  <b>{l.type}</b> → {board.cards[l.to].title}
                </button>
              ))}
            </dd>
          </>
        )}
        {into.length > 0 && (
          <>
            <dt>links in</dt>
            <dd>
              {into.map((l) => (
                <button key={l.id} className="lk" onClick={() => onSelect([l.from])}>
                  {board.cards[l.from].title} <b>{l.type}</b> →
                </button>
              ))}
            </dd>
          </>
        )}
        {card.tags.length > 0 && (
          <>
            <dt>tags</dt>
            <dd>{card.tags.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="mt-2.5 flex gap-1.5">
        <button className="tb-btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        {card.status === "open" ? (
          <button className="tb-btn" onClick={() => setStatus("resolved")}>
            Resolve
          </button>
        ) : (
          <button className="tb-btn" onClick={() => setStatus("open")}>
            Reopen
          </button>
        )}
      </div>
    </div>
  )
}

function EditCard(props: { card: Card; actions: BoardActions; onDone: () => void; onError: (m: string) => void }) {
  const { card, actions, onDone, onError } = props
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body ?? "")
  const [tags, setTags] = useState(card.tags.join(", "))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const changes: Record<string, unknown> = {}
    if (title.trim() && title.trim() !== card.title) changes.title = title.trim()
    if (body !== (card.body ?? "")) changes.body = body
    const tagList = parseTags(tags)
    if (tagList.join() !== card.tags.join()) changes.tags = tagList
    if (Object.keys(changes).length === 0) return onDone()
    try {
      await actions.call("update_card", { id: card.id, ...changes })
      onDone()
    } catch (err) {
      onError(`Update failed: ${(err as Error).message}`)
    }
  }

  return (
    <form className="tb-form" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <input autoFocus aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea aria-label="Body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <input aria-label="Tags" placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div className="flex justify-end gap-1.5">
        <button type="button" className="tb-btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="tb-btn primary">
          Save
        </button>
      </div>
    </form>
  )
}

function LinkForm(props: { from: Card; to: Card; actions: BoardActions; onError: (m: string) => void }) {
  const [flip, setFlip] = useState(false)
  const [type, setType] = useState<string>("follows-from")
  const from = flip ? props.to : props.from
  const to = flip ? props.from : props.to

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!type.trim()) return
    props.actions
      .call("link", { from: from.id, to: to.id, type: type.trim() })
      .catch((err: Error) => props.onError(`Link failed: ${err.message}`))
  }

  return (
    <form className="tb-form tb-subform" onSubmit={submit}>
      <div className="tb-form-title">Link</div>
      <div className="tb-linkline">
        “{from.title}” <b>{type || "…"}</b> “{to.title}”
      </div>
      <div className="flex gap-1.5">
        <input
          aria-label="Link type"
          list="tb-link-types"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-w-0 flex-1"
        />
        <datalist id="tb-link-types">
          {LINK_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="button" className="tb-btn ghost" onClick={() => setFlip(!flip)} title="Swap direction">
          ⇄
        </button>
        <button type="submit" className="tb-btn primary">
          Link
        </button>
      </div>
    </form>
  )
}

function RegionForm(props: { cards: Card[]; actions: BoardActions; onError: (m: string) => void }) {
  const { getInternalNode } = useReactFlow()
  const [title, setTitle] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const boxes = props.cards.map((c) => {
      const h = getInternalNode(c.id)?.measured.height ?? 120
      return { x1: c.x, y1: c.y, x2: c.x + CARD_WIDTH, y2: c.y + h }
    })
    const x = Math.min(...boxes.map((b) => b.x1)) - REGION_PADDING
    const y = Math.min(...boxes.map((b) => b.y1)) - REGION_PADDING - 16
    const w = Math.max(...boxes.map((b) => b.x2)) + REGION_PADDING - x
    const h = Math.max(...boxes.map((b) => b.y2)) + REGION_PADDING - y
    props.actions
      .call("create_region", { title: title.trim(), x, y, w: Math.round(w), h: Math.round(h) })
      .then(() => setTitle(""))
      .catch((err: Error) => props.onError(`Region failed: ${err.message}`))
  }

  return (
    <form className="tb-form tb-subform" onSubmit={submit}>
      <div className="tb-form-title">Group into a region</div>
      <div className="flex gap-1.5">
        <input
          aria-label="Region title"
          placeholder="Region title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1"
        />
        <button type="submit" className="tb-btn" disabled={!title.trim()}>
          Draw
        </button>
      </div>
    </form>
  )
}
