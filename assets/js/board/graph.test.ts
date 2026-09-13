import { describe, expect, it } from "vitest"
import { focusTiers, grammarOf, outlineGroups, pushTrail, TRAIL_LIMIT } from "./graph"
import type { Card, Kind, Link } from "./types"

const card = (id: string, kind: Kind = "idea", extra: Partial<Card> = {}): Card => ({
  id,
  kind,
  title: `Card ${id}`,
  tags: [],
  status: "open",
  pinned: false,
  x: 0,
  y: 0,
  created_by: "robert",
  ...extra,
})

const link = (id: string, from: string, to: string, type: string): Link => ({ id, from, to, type })

const board = (...cards: Card[]) => Object.fromEntries(cards.map((c) => [c.id, c]))

const ids = (ns: { card: Card }[]) => ns.map((n) => n.card.id)

describe("grammarOf", () => {
  it("treats the six hierarchical types as hierarchy and cites or unknown as jump", () => {
    for (const t of ["answers", "resolves", "raised-by", "follows-from", "depends-on", "challenges"]) {
      expect(grammarOf(t)).toBe("hierarchy")
    }
    expect(grammarOf("cites")).toBe("jump")
    expect(grammarOf("inspired")).toBe("jump")
  })
})

describe("focusTiers", () => {
  const cards = board(
    card("d", "decision"),
    card("q", "question"),
    card("o", "objection"),
    card("i"),
    card("s", "source"),
    card("x"),
  )

  it("puts the target of a hierarchical link from the centre above, labelled outward", () => {
    const t = focusTiers("d", cards, [link("l1", "d", "q", "answers")])
    expect(ids(t.parents)).toEqual(["q"])
    expect(t.parents[0].labels).toEqual(["answers →"])
    expect(t.children).toEqual([])
    expect(t.jumps).toEqual([])
  })

  it("puts the source of a hierarchical link into the centre below, labelled inward", () => {
    const t = focusTiers("d", cards, [link("l1", "o", "d", "challenges")])
    expect(ids(t.children)).toEqual(["o"])
    expect(t.children[0].labels).toEqual(["← challenges"])
  })

  it("makes cites and unknown types jumps in either direction", () => {
    const t = focusTiers("d", cards, [
      link("l1", "d", "s", "cites"),
      link("l2", "i", "d", "inspired"),
    ])
    expect(ids(t.jumps)).toEqual(["s", "i"])
    expect(t.jumps.map((n) => n.labels)).toEqual([["cites →"], ["← inspired"]])
    expect(t.parents).toEqual([])
    expect(t.children).toEqual([])
  })

  it("ignores links that don't touch the centre, self links and cards not on the board", () => {
    const t = focusTiers("d", cards, [
      link("l1", "q", "o", "answers"),
      link("l2", "d", "d", "answers"),
      link("l3", "d", "archived", "answers"),
      link("l4", "gone", "d", "cites"),
    ])
    expect(t).toEqual({ parents: [], children: [], jumps: [] })
  })

  it("shows a card linked twice in one tier once, with both labels", () => {
    const t = focusTiers("d", cards, [
      link("l1", "d", "q", "answers"),
      link("l2", "d", "q", "resolves"),
    ])
    expect(ids(t.parents)).toEqual(["q"])
    expect(t.parents[0].labels).toEqual(["answers →", "resolves →"])
    expect(t.parents[0].linkIds).toEqual(["l1", "l2"])
  })

  it("lets one card sit in two tiers when its links say so", () => {
    const t = focusTiers("d", cards, [link("l1", "d", "q", "depends-on"), link("l2", "q", "d", "cites")])
    expect(ids(t.parents)).toEqual(["q"])
    expect(ids(t.jumps)).toEqual(["q"])
  })

  it("keeps link order within a tier", () => {
    const t = focusTiers("d", cards, [
      link("l1", "d", "x", "follows-from"),
      link("l2", "d", "q", "answers"),
      link("l3", "i", "d", "raised-by"),
      link("l4", "o", "d", "challenges"),
    ])
    expect(ids(t.parents)).toEqual(["x", "q"])
    expect(ids(t.children)).toEqual(["i", "o"])
  })
})

describe("pushTrail", () => {
  it("adds the previous centre as the newest entry", () => {
    expect(pushTrail([], "a", "b")).toEqual(["a"])
    expect(pushTrail(["a"], "b", "c")).toEqual(["a", "b"])
  })

  it("does nothing without a previous centre or when the centre doesn't change", () => {
    const trail = ["a"]
    expect(pushTrail(trail, null, "b")).toBe(trail)
    expect(pushTrail(trail, "b", "b")).toBe(trail)
  })

  it("moves a revisited card to the end and drops the new centre from the trail", () => {
    expect(pushTrail(["a", "b"], "c", "d")).toEqual(["a", "b", "c"])
    expect(pushTrail(["a", "b", "c"], "d", "a")).toEqual(["b", "c", "d"])
    expect(pushTrail(["a", "b", "c"], "a", "d")).toEqual(["b", "c", "a"])
  })

  it("keeps only the newest entries", () => {
    let trail: string[] = []
    let centre = "c0"
    for (let i = 1; i <= TRAIL_LIMIT + 3; i++) {
      trail = pushTrail(trail, centre, `c${i}`)
      centre = `c${i}`
    }
    expect(trail).toHaveLength(TRAIL_LIMIT)
    expect(trail.at(-1)).toBe(`c${TRAIL_LIMIT + 2}`)
  })
})

describe("outlineGroups", () => {
  it("groups by kind in outline order, skipping empty kinds and archived cards", () => {
    const cards = [
      card("s1", "source"),
      card("i1"),
      card("q1", "question"),
      card("i2", "idea", { archived: true }),
      card("i3"),
    ]
    const groups = outlineGroups(cards, [])
    expect(groups.map((g) => g.kind)).toEqual(["idea", "question", "source"])
    expect(groups[0].rows.map((r) => r.card.id)).toEqual(["i1", "i3"])
  })

  it("lists each card's outgoing links to cards still on the board", () => {
    const cards = [card("d", "decision"), card("q", "question"), card("a", "idea", { archived: true })]
    const groups = outlineGroups(cards, [
      link("l1", "d", "q", "answers"),
      link("l2", "d", "a", "follows-from"),
      link("l3", "q", "d", "raised-by"),
    ])
    const decision = groups.find((g) => g.kind === "decision")!.rows[0]
    expect(decision.out.map((o) => [o.link.type, o.to.id])).toEqual([["answers", "q"]])
    const question = groups.find((g) => g.kind === "question")!.rows[0]
    expect(question.out.map((o) => o.link.id)).toEqual(["l3"])
  })
})
