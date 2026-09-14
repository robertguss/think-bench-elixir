import { useEffect, useMemo, useState } from "react"
import { EventFeed, ToolFeed } from "./ChangeFeed"
import { timeAgo, titleIndex } from "./describe"
import { LinkForm } from "./LinkForm"
import { RegionForm, RegionList } from "./RegionPanel"
import { SelectedCard } from "./SelectedCard"
import type { Card } from "./types"
import type { BoardActions, BoardState } from "./useBoard"

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
        <RegionList board={board} actions={actions} onError={onError} />
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
        <ToolFeed events={toolCalls} titles={titles} />
      </section>
    </aside>
  )
}
