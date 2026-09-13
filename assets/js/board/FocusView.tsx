import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BoardHead } from "./BoardHead"
import { CardFace } from "./CardFace"
import { focusTiers, type Neighbour, type Tiers } from "./graph"
import type { Card } from "./types"
import type { BoardState } from "./useBoard"

type Props = {
  board: BoardState
  tabs: ReactNode
  centreId: string | null
  trail: string[]
  // Re-centre on a card (a neighbour or a pin): selects it and extends the trail.
  onCentre: (id: string) => void
  // Go back to the trail entry at this index.
  onTrail: (index: number) => void
}

type Line = { key: string; d: string }
type TierName = keyof Tiers

const NO_TIERS: Tiers = { parents: [], children: [], jumps: [] }

/** TheBrain's Plex: one card centred, parents above, children below, jumps aside. */
export function FocusView({ board, tabs, centreId, trail, onCentre, onTrail }: Props) {
  const centre = centreId ? board.cards[centreId] : undefined
  const tiers = useMemo(
    () => (centre ? focusTiers(centre.id, board.cards, Object.values(board.links)) : NO_TIERS),
    [centre, board.cards, board.links],
  )
  const pins = Object.values(board.cards).filter((c) => c.pinned)

  return (
    <div className="tb-board-wrap flex min-h-0 flex-col">
      <BoardHead tabs={tabs}>
        <span className="tb-hint">click a neighbour to re-centre</span>
      </BoardHead>

      <div className="tb-focus min-h-0 flex-1 overflow-auto">
        {centre ? (
          <Plex centre={centre} tiers={tiers} onCentre={onCentre} />
        ) : (
          <div className="tb-focus-empty">
            {board.ready ? "Select a card in Map or Outline, or pick a pin below, to put it in the centre." : "Loading…"}
          </div>
        )}
      </div>

      <div className="tb-trail">
        <span>past</span>
        {trail.some((id) => board.cards[id]) ? (
          trail.map((id, i) => {
            const card = board.cards[id]
            if (!card) return null
            return (
              <span key={id} className="contents">
                {i > 0 && <span className="sep">›</span>}
                <button onClick={() => onTrail(i)} title={`Back to “${card.title}”`}>
                  {card.title}
                </button>
              </span>
            )
          })
        ) : (
          <span className="sep">none yet · click a neighbour to move</span>
        )}
        <span className="tb-pins">
          <span>pins</span>
          {pins.length === 0 && <span className="sep">none · pin a card in the inspector</span>}
          {pins.map((card) => (
            <button
              key={card.id}
              onClick={() => onCentre(card.id)}
              aria-current={card.id === centreId || undefined}
              title={`Centre “${card.title}”`}
            >
              {card.title}
            </button>
          ))}
        </span>
      </div>
    </div>
  )
}

function Plex({ centre, tiers, onCentre }: { centre: Card; tiers: Tiers; onCentre: (id: string) => void }) {
  const plex = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [hovered, setHovered] = useState<string | null>(null)

  // Lines from the centre's edge to each neighbour's facing edge, measured from the DOM
  // after layout (the tiers wrap, so positions aren't known until then).
  const measure = useCallback(() => {
    const root = plex.current
    const centreEl = root?.querySelector<HTMLElement>(".tb-card.centre")
    if (!root || !centreEl) return

    const pr = root.getBoundingClientRect()
    const ce = centreEl.getBoundingClientRect()
    const c = { l: ce.left - pr.left, r: ce.right - pr.left, t: ce.top - pr.top, b: ce.bottom - pr.top }
    const cx = (c.l + c.r) / 2
    const cy = (c.t + c.b) / 2

    const next: Line[] = []
    root.querySelectorAll<HTMLElement>("[data-tier] .tb-card").forEach((el) => {
      const tier = el.closest<HTMLElement>("[data-tier]")!.dataset.tier as TierName
      const r = el.getBoundingClientRect()
      const n = { l: r.left - pr.left, r: r.right - pr.left, t: r.top - pr.top, b: r.bottom - pr.top }
      const nx = (n.l + n.r) / 2
      const ny = (n.t + n.b) / 2
      const key = `${tier}:${el.dataset.card}`

      if (tier === "jumps" && n.l >= c.r) {
        const mx = (c.r + n.l) / 2
        next.push({ key, d: `M${c.r},${cy} C${mx},${cy} ${mx},${ny} ${n.l},${ny}` })
      } else if (ny < cy) {
        const my = (c.t + n.b) / 2
        next.push({ key, d: `M${cx},${c.t} C${cx},${my} ${nx},${my} ${nx},${n.b}` })
      } else {
        const my = (c.b + n.t) / 2
        next.push({ key, d: `M${cx},${c.b} C${cx},${my} ${nx},${my} ${nx},${n.t}` })
      }
    })

    setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, centre, tiers])

  useLayoutEffect(() => {
    const root = plex.current
    if (!root) return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    root.querySelectorAll(".tb-card").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [measure, centre, tiers])

  const tier = (name: TierName, label: string, empty: string | null) => {
    const neighbours: Neighbour[] = tiers[name]
    return (
      <section className={`tier ${name}`} data-tier={name} aria-label={label}>
        <span className="tier-label">
          {label} · {neighbours.length}
        </span>
        <div className="tier-cards">
          {neighbours.map((n) => {
            const key = `${name}:${n.card.id}`
            return (
              <CardFace
                key={n.card.id}
                card={n.card}
                variant="neighbour"
                highlighted={hovered === key}
                rel={n.labels.join(" · ")}
                onClick={() => onCentre(n.card.id)}
                onHover={(on) => setHovered((h) => (on ? key : h === key ? null : h))}
              />
            )
          })}
          {neighbours.length === 0 && empty && <span className="tier-empty">{empty}</span>}
        </div>
      </section>
    )
  }

  return (
    <div ref={plex} className="tb-plex">
      <svg className="tb-plex-lines" aria-hidden>
        {lines.map((l) => (
          <path key={l.key} d={l.d} className={hovered === l.key ? "hl" : undefined} />
        ))}
      </svg>
      {tier("parents", "parents", "no parents · this is a root")}
      <div className="centre-slot">
        <CardFace key={centre.id} card={centre} variant="centre" />
      </div>
      {tier("jumps", "jumps", null)}
      {tier("children", "children", "no children yet")}
    </div>
  )
}
