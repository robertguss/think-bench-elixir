import { Channel, Socket } from "phoenix"
import { useCallback, useEffect, useReducer, useRef } from "react"
import { boardReducer, type BoardState } from "./boardState"
import type { EventPush, JoinReply, Look, Move } from "./types"

const ENTER_MS = 600

export type { BoardState, Status } from "./boardState"

export type BoardActions = {
  call: <T = unknown>(event: string, payload: object) => Promise<T>
  moveLocal: (moves: Move[]) => void
}

function tabSessionId() {
  const fresh = () => `browser-${crypto.randomUUID()}`
  try {
    let id = sessionStorage.getItem("tb:session")
    if (!id) {
      id = fresh()
      sessionStorage.setItem("tb:session", id)
    }
    return id
  } catch {
    return fresh()
  }
}

function initialState(): BoardState {
  return {
    status: "connecting",
    ready: false,
    sessionId: tabSessionId(),
    cards: {},
    links: {},
    regions: {},
    events: [],
    actors: [],
    look: null,
    latestSeq: 0,
    entering: {},
  }
}

/** Joins `graph:main` and keeps a live copy of the board. */
export function useBoard(): [BoardState, BoardActions] {
  const [state, dispatch] = useReducer(boardReducer, undefined, initialState)
  const channelRef = useRef<Channel | null>(null)

  useEffect(() => {
    const socket = new Socket("/socket", { params: { session_id: state.sessionId } })
    socket.connect()
    socket.onError(() => dispatch({ type: "status", status: "offline" }))

    const channel = socket.channel("graph:main", {})
    channelRef.current = channel

    channel.on("event", (push: EventPush) => dispatch({ type: "event", push }))
    channel.on("look", ({ look }: { look: Look }) => dispatch({ type: "look", look }))

    channel
      .join()
      .receive("ok", (reply: JoinReply) => dispatch({ type: "joined", reply }))
      .receive("error", () => dispatch({ type: "status", status: "offline" }))

    return () => {
      channel.leave()
      socket.disconnect()
      channelRef.current = null
    }
  }, [state.sessionId])

  useEffect(() => {
    const ids = Object.keys(state.entering)
    if (ids.length === 0) return
    const timer = setTimeout(() => ids.forEach((id) => dispatch({ type: "entered", id })), ENTER_MS)
    return () => clearTimeout(timer)
  }, [state.entering])

  const call = useCallback(
    <T = unknown>(event: string, payload: object) =>
      new Promise<T>((resolve, reject) => {
        const channel = channelRef.current
        if (!channel) return reject(new Error("Not connected"))
        channel
          .push(event, payload)
          .receive("ok", (reply: T) => resolve(reply))
          .receive("error", (e: { message?: string }) => reject(new Error(e.message ?? "Failed")))
          .receive("timeout", () => reject(new Error("Timed out")))
      }),
    [],
  )

  const moveLocal = useCallback((moves: Move[]) => dispatch({ type: "moveLocal", moves }), [])

  return [state, { call, moveLocal }]
}
