import { useState, type FormEvent } from "react"
import { KINDS, type Card, type Kind } from "./types"
import type { BoardActions } from "./useBoard"

type Props = {
  position: { x: number; y: number }
  actions: BoardActions
  onDone: (card: Card | null) => void
  onError: (message: string) => void
}

export const parseTags = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

/** A small form over the map that creates a card at `position` as robert. */
export function NewCardForm({ position, actions, onDone, onError }: Props) {
  const [kind, setKind] = useState<Kind>("idea")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [tags, setTags] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const { card } = await actions.call<{ card: Card }>("create_card", {
        kind,
        title: title.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
        tags: parseTags(tags),
        ...position,
      })
      onDone(card)
    } catch (err) {
      onError(`Create failed: ${(err as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <form
      className="tb-form tb-floating"
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onDone(null)}
      aria-label="New card"
    >
      <div className="tb-form-title">New card at {position.x}, {position.y}</div>
      <div className="tb-kinds" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={`k-${k}`}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Body (optional)" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <input placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div className="flex justify-end gap-1.5">
        <button type="button" className="tb-btn ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="submit" className="tb-btn primary" disabled={busy || !title.trim()}>
          Create
        </button>
      </div>
    </form>
  )
}
