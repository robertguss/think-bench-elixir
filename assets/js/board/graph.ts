// Pure graph logic for the Focus and Outline views. No React, no DOM: unit tested in
// graph.test.ts.

import { HIERARCHY_TYPES, type Card, type Kind, type Link } from "./types"

export { HIERARCHY_TYPES }

export type Grammar = "hierarchy" | "jump"

export const grammarOf = (type: string): Grammar => (HIERARCHY_TYPES.has(type) ? "hierarchy" : "jump")

/** A neighbour of the centre card, with the links that put it in its tier. */
export type Neighbour = {
  card: Card
  // "answers →" when the centre links to the neighbour, "← cites" when it links in.
  labels: string[]
  linkIds: string[]
}

export type Tiers = { parents: Neighbour[]; children: Neighbour[]; jumps: Neighbour[] }

/**
 * Places every card linked to `centreId` into parents, children or jumps.
 *
 * - centre --hierarchical--> other: other is a parent, labelled "type →"
 * - other --hierarchical--> centre: other is a child, labelled "← type"
 * - cites or an unknown type, either way: a jump, labelled by direction
 *
 * A card linked more than once in the same tier appears once with every label. Links to
 * cards that are not on the board (archived) and self links are ignored. Order follows
 * the order of `links`.
 */
export function focusTiers(centreId: string, cards: Record<string, Card>, links: Iterable<Link>): Tiers {
  const tiers: Record<keyof Tiers, Map<string, Neighbour>> = {
    parents: new Map(),
    children: new Map(),
    jumps: new Map(),
  }

  const add = (tier: keyof Tiers, card: Card, label: string, linkId: string) => {
    const existing = tiers[tier].get(card.id)
    if (existing) {
      existing.labels.push(label)
      existing.linkIds.push(linkId)
    } else {
      tiers[tier].set(card.id, { card, labels: [label], linkIds: [linkId] })
    }
  }

  for (const link of links) {
    if (link.from === link.to) continue
    const outgoing = link.from === centreId
    if (!outgoing && link.to !== centreId) continue

    const other = cards[outgoing ? link.to : link.from]
    if (!other) continue

    const label = outgoing ? `${link.type} →` : `← ${link.type}`
    const tier = grammarOf(link.type) === "jump" ? "jumps" : outgoing ? "parents" : "children"
    add(tier, other, label, link.id)
  }

  return {
    parents: [...tiers.parents.values()],
    children: [...tiers.children.values()],
    jumps: [...tiers.jumps.values()],
  }
}

export const TRAIL_LIMIT = 8

/**
 * The trail after moving the centre from `prev` to `next`: `prev` becomes the newest
 * entry. Each card appears at most once (an earlier visit moves to the end), the card
 * now in the centre is not in the trail, and only the newest TRAIL_LIMIT are kept.
 */
export function pushTrail(trail: string[], prev: string | null, next: string): string[] {
  if (!prev || prev === next) return trail
  return [...trail.filter((id) => id !== prev && id !== next), prev].slice(-TRAIL_LIMIT)
}

// The Outline's group order.
export const OUTLINE_KINDS: readonly Kind[] = ["idea", "question", "decision", "objection", "source"]

export type OutlineRow = { card: Card; out: { link: Link; to: Card }[] }
export type OutlineGroup = { kind: Kind; rows: OutlineRow[] }

/**
 * Cards grouped by kind in OUTLINE_KINDS order, each with its outgoing links to cards on
 * the board. Archived cards are left out, as are empty groups. Cards keep the order
 * they are given in.
 */
export function outlineGroups(cards: Iterable<Card>, links: Iterable<Link>): OutlineGroup[] {
  const live = [...cards].filter((c) => !c.archived)
  const byId = new Map(live.map((c) => [c.id, c]))
  const out = new Map<string, OutlineRow["out"]>()

  for (const link of links) {
    const to = byId.get(link.to)
    if (!to || !byId.has(link.from)) continue
    out.set(link.from, [...(out.get(link.from) ?? []), { link, to }])
  }

  return OUTLINE_KINDS.map((kind) => ({
    kind,
    rows: live.filter((c) => c.kind === kind).map((card) => ({ card, out: out.get(card.id) ?? [] })),
  })).filter((group) => group.rows.length > 0)
}
