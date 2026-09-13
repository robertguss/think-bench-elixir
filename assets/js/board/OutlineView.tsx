import { useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { BoardHead } from "./BoardHead"
import { outlineGroups } from "./graph"
import type { BoardState } from "./useBoard"

type Props = {
  board: BoardState
  tabs: ReactNode
  selectedIds: string[]
  onSelect: (ids: string[]) => void
}

/** Cards grouped by kind, each with its outgoing links. */
export function OutlineView({ board, tabs, selectedIds, onSelect }: Props) {
  const groups = useMemo(
    () => outlineGroups(Object.values(board.cards), Object.values(board.links)),
    [board.cards, board.links],
  )
  const selected = new Set(selectedIds)

  // Click selects one card; shift or cmd click adds or removes it, as on the map.
  const select = (id: string, additive: boolean) => {
    if (!additive) return onSelect([id])
    onSelect(selected.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id])
  }

  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
    e.preventDefault()
    select(id, e.shiftKey || e.metaKey)
  }

  return (
    <div className="tb-board-wrap flex min-h-0 flex-col">
      <BoardHead tabs={tabs}>
        <span className="tb-hint">click to select · shift-click to select several</span>
      </BoardHead>

      <div className="tb-outline min-h-0 flex-1 overflow-auto">
        {groups.length === 0 && <div className="tb-empty">{board.ready ? "No cards yet." : "Loading…"}</div>}
        {groups.map(({ kind, rows }) => (
          <section key={kind} className="ogroup" aria-label={`${kind}s`}>
            <h4 style={{ color: `var(--${kind})` }}>
              <i style={{ background: `var(--${kind})` }} />
              {kind}s <span className="n">{rows.length}</span>
            </h4>
            {rows.map(({ card, out }) => (
              <div
                key={card.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected.has(card.id)}
                className={`orow${selected.has(card.id) ? " selected" : ""}`}
                onClick={(e: MouseEvent) => select(card.id, e.shiftKey || e.metaKey)}
                onKeyDown={(e) => onRowKey(e, card.id)}
              >
                <div className="min-w-0">
                  <div className={`t${card.status === "resolved" ? " done" : ""}`}>
                    {card.title}
                    {card.pinned && <span className="pin">pinned</span>}
                  </div>
                  {out.length > 0 && (
                    <div className="l">
                      {out.map(({ link, to }, i) => (
                        <span key={link.id}>
                          {i > 0 && " · "}
                          <button
                            className="lk"
                            title={`Select “${to.title}”`}
                            onClick={(e) => {
                              e.stopPropagation()
                              select(to.id, e.shiftKey || e.metaKey)
                            }}
                          >
                            <b>{link.type}</b> → {to.title}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="by">{card.created_by}</div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
