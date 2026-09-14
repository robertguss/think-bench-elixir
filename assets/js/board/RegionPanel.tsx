import { useState, type FormEvent } from "react"
import { CARD_HEIGHT, CARD_WIDTH, type Card, type Region } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

const REGION_PADDING = 24

export function RegionForm(props: { cards: Card[]; actions: BoardActions; onError: (m: string) => void }) {
  const [title, setTitle] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const boxes = props.cards.map((c) => ({
      x1: c.x,
      y1: c.y,
      x2: c.x + CARD_WIDTH,
      y2: c.y + CARD_HEIGHT,
    }))
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

export function RegionList(props: { board: BoardState; actions: BoardActions; onError: (m: string) => void }) {
  const regions = Object.values(props.board.regions)
  if (regions.length === 0) return null

  return (
    <div className="tb-subform">
      <div className="tb-form-title">Regions</div>
      {regions.map((region) => (
        <RegionRow key={region.id} region={region} actions={props.actions} onError={props.onError} />
      ))}
    </div>
  )
}

function RegionRow(props: { region: Region; actions: BoardActions; onError: (m: string) => void }) {
  const { region, actions, onError } = props
  const [title, setTitle] = useState(region.title)

  const save = () => {
    const next = title.trim()
    if (!next || next === region.title) return
    actions.call("update_region", { id: region.id, title: next }).catch((e: Error) => onError(`Region update failed: ${e.message}`))
  }

  const remove = () =>
    actions.call("destroy_region", { id: region.id }).catch((e: Error) => onError(`Region delete failed: ${e.message}`))

  return (
    <div className="mt-1.5 flex gap-1.5">
      <input
        aria-label={`Title of region ${region.title}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        className="min-w-0 flex-1"
      />
      <button type="button" className="tb-btn ghost" onClick={remove}>
        Delete
      </button>
    </div>
  )
}
