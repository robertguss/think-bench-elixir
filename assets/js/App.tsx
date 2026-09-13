import { ReactFlowProvider, type Viewport } from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ViewTabs, type View } from "./board/BoardHead"
import { FocusView } from "./board/FocusView"
import { pushTrail } from "./board/graph"
import { Inspector } from "./board/Inspector"
import { MapView } from "./board/MapView"
import { OutlineView } from "./board/OutlineView"
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

type Focus = { id: string | null; trail: string[] }

export default function App() {
  const [board, actions] = useBoard()
  const [selection, setSelection] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("map")
  const [mapViewport, setMapViewport] = useState<Viewport | null>(null)
  // The Focus centre and the trail of past centres. Client state only.
  const [focus, setFocus] = useState<Focus>({ id: null, trail: [] })

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

  // The Focus centre follows the most recently selected card, in every view. Moves made
  // inside Focus (a neighbour, a pin, a link in the inspector) leave the old centre on
  // the trail; selecting elsewhere just sets the centre, as in the prototype.
  const primary = selectedIds.at(-1) ?? null
  useEffect(() => {
    if (!primary) return
    setFocus((f) =>
      f.id === primary ? f : { id: primary, trail: view === "focus" ? pushTrail(f.trail, f.id, primary) : f.trail },
    )
  }, [primary, view])

  const switchView = (next: View) => {
    // Opening Focus with nothing selected re-selects the last centre, or the first pin,
    // so the centre and the selection (what the AI sees) agree.
    if (next === "focus" && selectedIds.length === 0) {
      const fallback =
        (focus.id && board.cards[focus.id] ? focus.id : null) ??
        Object.values(board.cards).find((c) => c.pinned)?.id
      if (fallback) onSelect([fallback])
    }
    setView(next)
  }

  const onCentre = useCallback((id: string) => onSelect([id]), [onSelect])

  const onTrail = (index: number) => {
    const id = focus.trail[index]
    if (!id) return
    setFocus({ id, trail: focus.trail.slice(0, index) })
    onSelect([id])
  }

  const onError = useCallback((message: string) => setError(message), [])
  const tabs = <ViewTabs view={view} onView={switchView} />

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
          {view === "map" && (
            <MapView
              board={board}
              actions={actions}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onError={onError}
              tabs={tabs}
              viewport={mapViewport}
              onLeave={setMapViewport}
            />
          )}
          {view === "focus" && (
            <FocusView
              board={board}
              tabs={tabs}
              centreId={primary ?? focus.id}
              trail={focus.trail}
              onCentre={onCentre}
              onTrail={onTrail}
            />
          )}
          {view === "outline" && (
            <OutlineView board={board} tabs={tabs} selectedIds={selectedIds} onSelect={onSelect} />
          )}
          <Inspector board={board} actions={actions} selectedIds={selectedIds} onSelect={onSelect} onError={onError} />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
