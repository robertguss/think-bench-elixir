import { ReactFlowProvider } from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Inspector } from "./board/Inspector"
import { MapView } from "./board/MapView"
import { useBoard } from "./board/useBoard"

function toggleTheme() {
  const root = document.documentElement
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark"
  root.setAttribute("data-theme", next)
  root.setAttribute("data-theme-source", "user")
  try {
    localStorage.setItem("phx:theme", next)
  } catch {
    // Private mode: the toggle still applies for this page.
  }
}

export default function App() {
  const [board, actions] = useBoard()
  const [selection, setSelection] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Keep the order cards were selected in (the link form reads "first → second").
  const onSelect = useCallback((ids: string[]) => {
    setSelection((prev) => {
      const kept = prev.filter((id) => ids.includes(id))
      const added = ids.filter((id) => !prev.includes(id))
      const next = [...kept, ...added]
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next
    })
  }, [])

  // Cards that left the map (archived) drop out of the selection.
  const selectedIds = useMemo(() => selection.filter((id) => board.cards[id]), [selection, board.cards])

  // Tell the server what is selected, on every change and on every (re)join, so the
  // MCP read_selection tool always sees what this tab shows.
  const selectionKey = selectedIds.join(",")
  useEffect(() => {
    if (board.status !== "live") return
    actions.call("select", { card_ids: selectedIds }).catch((e: Error) => setError(`Selection not sent: ${e.message}`))
  }, [selectionKey, board.status, actions])

  const onError = useCallback((message: string) => setError(message), [])

  return (
    <ReactFlowProvider>
      <div className="tb-app mx-auto grid h-screen max-w-[1600px] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-2.5 py-2.5">
        <header className="flex flex-wrap items-center gap-3.5">
          <div className="tb-brand flex items-baseline gap-2.5">
            <h1>Think Bench</h1>
            <span className="doc">
              graph:main · seq {board.latestSeq} · {Object.keys(board.cards).length} cards
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {board.actors.map((a) => (
              <span key={a.name} className="tb-chip">
                <span className="dot" style={{ background: a.kind === "agent" ? "var(--accent)" : "var(--term-you)" }} />
                {a.name}
              </span>
            ))}
          </div>
          <div className="flex-1" />
          {error && (
            <button className="tb-error" onClick={() => setError(null)} title="Dismiss">
              {error} ×
            </button>
          )}
          <span className={`tb-status ${board.status}`}>{board.status}</span>
          <button className="tb-btn ghost" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            ◐
          </button>
        </header>

        <div className="tb-workspace grid min-h-0 gap-2.5">
          <MapView board={board} actions={actions} selectedIds={selectedIds} onSelect={onSelect} onError={onError} />
          <Inspector board={board} actions={actions} selectedIds={selectedIds} onSelect={onSelect} onError={onError} />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
