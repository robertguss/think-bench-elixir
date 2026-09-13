import { Channel, Socket } from "phoenix"
import { useCallback, useEffect, useReducer, useRef } from "react"
import type { Actor, Card, EventPush, GraphEvent, JoinReply, Link, Look, Move, Region } from "./types"

// How many events the client keeps for the inspector (the server sends the newest 200 on join).
const MAX_EVENTS = 500
const ENTER_MS = 600

export type Status = "connecting" | "live" | "offline"

export type BoardState = {
  status: Status
  ready: boolean
  sessionId: string
  cards: Record<string, Card>
  links: Record<string, Link>
  regions: Record<string, Region>
  events: GraphEvent[]
  actors: Actor[]
  look: Look | null
  latestSeq: number
  // Cards that arrived live and should play the enter animation.
  entering: Record<string, true>
}

type Action =
  | { type: "joined"; reply: JoinReply }
  | { type: "status"; status: Status }
  | { type: "event"; push: EventPush }
  | { type: "look"; look: Look }
  | { type: "moveLocal"; moves: Move[] }
  | { type: "entered"; id: string }

const byId = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>

function without<T>(record: Record<string, T>, id: string) {
  const next = { ...record }
  delete next[id]
  return next
}

function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "joined": {
      const { reply } = action
      return {
        ...state,
        ready: true,
        status: "live",
        cards: byId(reply.cards),
        links: byId(reply.links),
        regions: byId(reply.regions),
        events: reply.events,
        actors: reply.actors,
        look: reply.look,
        latestSeq: reply.latest_seq,
        entering: {},
      }
    }
    case "status":
      return { ...state, status: action.status }
    case "event": {
      const { event, card, link, region, removed } = action.push
      let next = { ...state }

      if (card) {
        if (card.archived) {
          next.cards = without(next.cards, card.id)
        } else {
          if (!next.cards[card.id] && event.action === "create") {
            next.entering = { ...next.entering, [card.id]: true }
          }
          next.cards = { ...next.cards, [card.id]: card }
        }
      }
      if (link) next.links = { ...next.links, [link.id]: link }
      if (region) next.regions = { ...next.regions, [region.id]: region }
      if (removed?.resource === "card") next.cards = without(next.cards, removed.id)
      if (removed?.resource === "link") next.links = without(next.links, removed.id)
      if (removed?.resource === "region") next.regions = without(next.regions, removed.id)

      const lastSeq = next.events.at(-1)?.seq ?? 0
      if (event.seq > lastSeq) next.events = [...next.events, event].slice(-MAX_EVENTS)
      next.latestSeq = Math.max(next.latestSeq, event.seq)
      return next
    }
    case "look":
      return { ...state, look: action.look }
    case "moveLocal": {
      const cards = { ...state.cards }
      for (const { id, x, y } of action.moves) if (cards[id]) cards[id] = { ...cards[id], x, y }
      return { ...state, cards }
    }
    case "entered":
      return { ...state, entering: without(state.entering, action.id) }
  }
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

export type BoardActions = {
  call: <T = unknown>(event: string, payload: object) => Promise<T>
  moveLocal: (moves: Move[]) => void
}

/** Joins `graph:main` and keeps a live copy of the board. */
export function useBoard(): [BoardState, BoardActions] {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const channelRef = useRef<Channel | null>(null)

  useEffect(() => {
    const socket = new Socket("/socket", { params: { session_id: state.sessionId } })
    socket.connect()
    socket.onError(() => dispatch({ type: "status", status: "offline" }))

    const channel = socket.channel("graph:main", {})
    channelRef.current = channel

    channel.on("event", (push: EventPush) => dispatch({ type: "event", push }))
    channel.on("look", ({ look }: { look: Look }) => dispatch({ type: "look", look }))

    // Phoenix rejoins after a reconnect; each successful join replaces the snapshot.
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

  // Let live cards finish their enter animation, then treat them as settled.
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
