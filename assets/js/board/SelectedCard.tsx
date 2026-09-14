import { useState, type FormEvent } from "react"
import { timeAgo } from "./describe"
import { parseTags } from "./NewCardForm"
import type { Card } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

export function SelectedCard(props: {
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

  const update = (changes: Partial<Pick<Card, "status" | "pinned">>) =>
    actions.call("update_card", { id: card.id, ...changes }).catch((e: Error) => onError(`Update failed: ${e.message}`))

  const unlink = (id: string) =>
    actions.call("unlink", { id }).catch((e: Error) => onError(`Unlink failed: ${e.message}`))

  const archive = () =>
    actions.call("archive_card", { id: card.id }).catch((e: Error) => onError(`Archive failed: ${e.message}`))

  if (editing) return <EditCard card={card} actions={actions} onDone={() => setEditing(false)} onError={onError} />

  return (
    <div className="tb-sel">
      <div className="kindline" style={{ color: `var(--${card.kind})` }}>
        {card.kind.toUpperCase()} · {card.status}
        {card.pinned && " · pinned"}
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
                <span key={l.id} className="flex items-center gap-1">
                  <button className="lk" onClick={() => onSelect([l.to])}>
                    <b>{l.type}</b> → {board.cards[l.to].title}
                  </button>
                  <button type="button" className="tb-btn ghost" onClick={() => unlink(l.id)} title="Remove link">
                    ×
                  </button>
                </span>
              ))}
            </dd>
          </>
        )}
        {into.length > 0 && (
          <>
            <dt>links in</dt>
            <dd>
              {into.map((l) => (
                <span key={l.id} className="flex items-center gap-1">
                  <button className="lk" onClick={() => onSelect([l.from])}>
                    {board.cards[l.from].title} <b>{l.type}</b> →
                  </button>
                  <button type="button" className="tb-btn ghost" onClick={() => unlink(l.id)} title="Remove link">
                    ×
                  </button>
                </span>
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
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button className="tb-btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        {card.status === "open" ? (
          <button className="tb-btn" onClick={() => update({ status: "resolved" })}>
            Resolve
          </button>
        ) : (
          <button className="tb-btn" onClick={() => update({ status: "open" })}>
            Reopen
          </button>
        )}
        <button
          className="tb-btn"
          aria-pressed={card.pinned}
          onClick={() => update({ pinned: !card.pinned })}
          title={card.pinned ? "Remove from the Focus pins" : "Keep in the Focus pins"}
        >
          {card.pinned ? "Unpin" : "Pin"}
        </button>
        <button className="tb-btn ghost" onClick={archive}>
          Archive
        </button>
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
