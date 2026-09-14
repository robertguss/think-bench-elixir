import { ReactFlowProvider, type Viewport } from "@xyflow/react"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { ViewTabs, type View } from "./board/BoardHead"
import { FocusView } from "./board/FocusView"
import { Inspector } from "./board/Inspector"
import { MapView } from "./board/MapView"
import { OutlineView } from "./board/OutlineView"
import { useBoard } from "./board/useBoard"
import { shouldPublishSelection, workspaceReducer, initialWorkspace } from "./board/workspace"

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
  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, initialWorkspace)
  const [error, setError] = useState<string | null>(null)
  const [mapViewport, setMapViewport] = useState<Viewport | null>(null)
  const published = useRef(false)

  const liveIds = Object.keys(board.cards)
  const liveKey = liveIds.join(",")
  useEffect(() => {
    dispatch({ type: "retain", liveIds: new Set(liveIds) })
  }, [liveKey])

  const selectedIds = workspace.selection.filter((id) => board.cards[id])
  const selectionKey = selectedIds.join(",")

  const publish = useCallback(
    (ids: string[], reason: "user" | "join") => {
      if (
        !shouldPublishSelection({
          reason,
          ids,
          published: published.current,
          focused: typeof document !== "undefined" && document.hasFocus(),
        })
      ) {
        return
      }
      published.current = true
      actions.call("select", { card_ids: ids }).catch((e: Error) => setError(`Selection not sent: ${e.message}`))
    },
    [actions],
  )

  useEffect(() => {
    if (board.status !== "live") return
    publish(selectedIds, published.current ? "user" : "join")
  }, [selectionKey, board.status, publish])

  const onSelect = useCallback((ids: string[]) => {
    dispatch({ type: "select", ids })
  }, [])

  const onCentre = useCallback((id: string) => {
    dispatch({ type: "centre", id })
  }, [])

  const onTrail = (index: number) => dispatch({ type: "back", index })

  const switchView = (next: View) => {
    const fallback =
      (workspace.focus.id && board.cards[workspace.focus.id] ? workspace.focus.id : null) ??
      Object.values(board.cards).find((c) => c.pinned)?.id ??
      null
    dispatch({ type: "switchView", view: next, fallback })
  }

  const onError = useCallback((message: string) => setError(message), [])
  const tabs = <ViewTabs view={workspace.view} onView={switchView} />
  const primary = selectedIds.at(-1) ?? workspace.focus.id

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
          {workspace.view === "map" && (
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
          {workspace.view === "focus" && (
            <FocusView
              board={board}
              tabs={tabs}
              centreId={primary}
              trail={workspace.focus.trail}
              onCentre={onCentre}
              onTrail={onTrail}
            />
          )}
          {workspace.view === "outline" && (
            <OutlineView board={board} tabs={tabs} selectedIds={selectedIds} onSelect={onSelect} />
          )}
          <Inspector board={board} actions={actions} selectedIds={selectedIds} onSelect={onSelect} onError={onError} />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
