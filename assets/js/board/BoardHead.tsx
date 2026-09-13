import type { ReactNode } from "react"
import { KINDS } from "./types"

export const VIEWS = ["map", "focus", "outline"] as const
export type View = (typeof VIEWS)[number]

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Map / Focus / Outline tabs. */
export function ViewTabs({ view, onView }: { view: View; onView: (view: View) => void }) {
  return (
    <div className="tb-tabs" role="tablist" aria-label="Views">
      {VIEWS.map((v) => (
        <button key={v} role="tab" aria-selected={v === view} onClick={() => onView(v)}>
          {capitalise(v)}
        </button>
      ))}
    </div>
  )
}

/** The head every view shares: tabs, the view's own controls, the kind legend. */
export function BoardHead({ tabs, children }: { tabs: ReactNode; children?: ReactNode }) {
  return (
    <div className="tb-board-head flex flex-wrap items-center gap-2.5">
      {tabs}
      {children}
      <div className="tb-legend ml-auto flex flex-wrap gap-2.5">
        {KINDS.map((k) => (
          <span key={k}>
            <i style={{ background: `var(--${k})` }} />
            {capitalise(k)}
          </span>
        ))}
      </div>
    </div>
  )
}
