import { describe, expect, it } from "vitest"
import { boardReducer, type BoardState } from "./boardState"
import type { Card, EventPush, GraphEvent, JoinReply } from "./types"

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  kind: "idea",
  title: id,
  tags: [],
  status: "open",
  pinned: false,
  x: 0,
  y: 0,
  created_by: "robert",
  ...extra,
})

const event = (seq: number, extra: Partial<GraphEvent> = {}): GraphEvent => ({
  seq,
  actor: "robert",
  resource: "card",
  action: "create",
  record_id: "a",
  changes: {},
  at: "2026-01-01T00:00:00Z",
  ...extra,
})

const empty = (): BoardState => ({
  status: "connecting",
  ready: false,
  sessionId: "tab-1",
  cards: {},
  links: {},
  regions: {},
  events: [],
  actors: [],
  look: null,
  latestSeq: 0,
  entering: {},
})

describe("boardReducer", () => {
  it("replaces the snapshot on join", () => {
    const reply: JoinReply = {
      session_id: "tab-1",
      latest_seq: 2,
      cards: [card("a")],
      links: [],
      regions: [],
      events: [event(1), event(2)],
      actors: [{ name: "robert", kind: "human" }],
      look: null,
    }
    const next = boardReducer(empty(), { type: "joined", reply })
    expect(next.ready).toBe(true)
    expect(next.status).toBe("live")
    expect(next.cards.a?.title).toBe("a")
    expect(next.latestSeq).toBe(2)
  })

  it("removes an archived card and records the event", () => {
    const joined = boardReducer(empty(), {
      type: "joined",
      reply: {
        session_id: "tab-1",
        latest_seq: 1,
        cards: [card("a")],
        links: [],
        regions: [],
        events: [event(1)],
        actors: [],
        look: null,
      },
    })
    const push: EventPush = {
      event: event(2, { action: "archive", record_id: "a" }),
      card: card("a", { archived: true }),
    }
    const next = boardReducer(joined, { type: "event", push })
    expect(next.cards.a).toBeUndefined()
    expect(next.events.at(-1)?.seq).toBe(2)
    expect(next.latestSeq).toBe(2)
  })

  it("drops a removed link and ignores a duplicate seq", () => {
    const state: BoardState = {
      ...empty(),
      ready: true,
      status: "live",
      links: { l1: { id: "l1", from: "a", to: "b", type: "cites" } },
      events: [event(3)],
      latestSeq: 3,
    }
    const next = boardReducer(state, {
      type: "event",
      push: { event: event(3, { resource: "link", action: "destroy" }), removed: { resource: "link", id: "l1" } },
    })
    expect(next.links.l1).toBeUndefined()
    expect(next.events).toHaveLength(1)
  })

  it("applies a local move", () => {
    const state: BoardState = { ...empty(), cards: { a: card("a", { x: 0, y: 0 }) } }
    const next = boardReducer(state, { type: "moveLocal", moves: [{ id: "a", x: 40, y: 80 }] })
    expect(next.cards.a).toMatchObject({ x: 40, y: 80 })
  })
})
