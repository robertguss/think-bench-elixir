import type { Actor, Card, EventPush, GraphEvent, JoinReply, Link, Look, Move, Region } from "./types"

export const MAX_EVENTS = 500

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
  entering: Record<string, true>
}

export type BoardAction =
  | { type: "joined"; reply: JoinReply }
  | { type: "status"; status: Status }
  | { type: "event"; push: EventPush }
  | { type: "look"; look: Look }
  | { type: "moveLocal"; moves: Move[] }
  | { type: "entered"; id: string }

const byId = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>

export function without<T>(record: Record<string, T>, id: string) {
  const next = { ...record }
  delete next[id]
  return next
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
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
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
