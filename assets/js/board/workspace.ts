import { pushTrail } from "./graph"
import type { View } from "./BoardHead"

export type Focus = { id: string | null; trail: string[] }

export type Workspace = {
  selection: string[]
  view: View
  focus: Focus
}

export type WorkspaceAction =
  | { type: "select"; ids: string[] }
  | { type: "centre"; id: string }
  | { type: "back"; index: number }
  | { type: "switchView"; view: View; fallback?: string | null }
  | { type: "retain"; liveIds: ReadonlySet<string> }

export function initialWorkspace(): Workspace {
  return { selection: [], view: "map", focus: { id: null, trail: [] } }
}

/** Keep previous order, append newly added ids. */
export function mergeSelection(prev: string[], ids: string[]) {
  const kept = prev.filter((id) => ids.includes(id))
  const added = ids.filter((id) => !prev.includes(id))
  const next = [...kept, ...added]
  return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next
}

/**
 * Whether this tab should POST `select` to the server.
 * Join/sync of an empty, unpublished, or unfocused tab must not steal `read_selection`.
 */
export function shouldPublishSelection(opts: {
  reason: "user" | "join"
  ids: string[]
  published: boolean
  focused: boolean
}) {
  if (opts.reason === "user") return true
  if (!opts.published && opts.ids.length === 0) return false
  if (!opts.published && !opts.focused) return false
  return opts.ids.length > 0
}

function followFocus(state: Workspace, primary: string | null): Focus {
  if (!primary) return state.focus
  if (state.focus.id === primary) return state.focus
  return {
    id: primary,
    trail: state.view === "focus" ? pushTrail(state.focus.trail, state.focus.id, primary) : state.focus.trail,
  }
}

export function workspaceReducer(state: Workspace, action: WorkspaceAction): Workspace {
  switch (action.type) {
    case "select": {
      const selection = mergeSelection(state.selection, action.ids)
      const primary = selection.at(-1) ?? null
      return { ...state, selection, focus: followFocus(state, primary) }
    }
    case "centre":
      return {
        ...state,
        selection: [action.id],
        focus: {
          id: action.id,
          trail: state.view === "focus" ? pushTrail(state.focus.trail, state.focus.id, action.id) : state.focus.trail,
        },
      }
    case "back": {
      const id = state.focus.trail[action.index]
      if (!id) return state
      return { ...state, selection: [id], focus: { id, trail: state.focus.trail.slice(0, action.index) } }
    }
    case "switchView": {
      if (action.view === "focus" && state.selection.length === 0 && action.fallback) {
        return {
          ...state,
          view: action.view,
          selection: [action.fallback],
          focus: { ...state.focus, id: action.fallback },
        }
      }
      return { ...state, view: action.view }
    }
    case "retain": {
      const selection = state.selection.filter((id) => action.liveIds.has(id))
      const focusId = state.focus.id && action.liveIds.has(state.focus.id) ? state.focus.id : selection.at(-1) ?? null
      return {
        ...state,
        selection,
        focus: {
          id: focusId,
          trail: state.focus.trail.filter((id) => action.liveIds.has(id)),
        },
      }
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
