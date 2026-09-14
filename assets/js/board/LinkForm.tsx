import { useState, type FormEvent } from "react"
import { LINK_TYPES, type Card } from "./types"
import type { BoardActions } from "./useBoard"

export function LinkForm(props: { from: Card; to: Card; actions: BoardActions; onError: (m: string) => void }) {
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
