import type { BoardState } from "./useBoard"
import type { GraphEvent } from "./types"

/** Card titles by id, including cards no longer on the map (from their create events). */
export function titleIndex(state: BoardState) {
  const titles: Record<string, string> = {}
  for (const e of state.events) {
    if (e.resource === "card" && typeof e.changes.title === "string") titles[e.record_id] = e.changes.title
  }
  for (const card of Object.values(state.cards)) titles[card.id] = card.title
  return titles
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined)

function titleOf(titles: Record<string, string>, id: unknown) {
  const t = typeof id === "string" ? titles[id] : undefined
  return t ? `“${t}”` : "a card"
}

function describeCard(e: GraphEvent, titles: Record<string, string>) {
  const c = e.changes
  const card = titleOf(titles, e.record_id)

  switch (e.action) {
    case "create":
      return `created ${str(c.kind) ?? "card"} ${card}`
    case "move":
      return `moved ${card}`
    case "archive":
      return `archived ${card}`
    case "update": {
      const fields = Object.keys(c).filter((k) => ["title", "body", "tags", "status", "pinned"].includes(k))
      if (fields.length === 1 && fields[0] === "status") return `marked ${card} ${str(c.status)}`
      if (fields.length === 1 && fields[0] === "pinned") return `${c.pinned ? "pinned" : "unpinned"} ${card}`
      return `edited ${card}${fields.length ? ` (${fields.join(", ")})` : ""}`
    }
    default:
      return `${e.action} ${card}`
  }
}

function describeLink(e: GraphEvent, titles: Record<string, string>) {
  const c = e.changes
  if (e.action === "create")
    return `linked ${titleOf(titles, c.from_card_id)} ${str(c.type)} ${titleOf(titles, c.to_card_id)}`
  if (e.action === "destroy") return "removed a link"
  return `${e.action} a link`
}

function describeRegion(e: GraphEvent) {
  const c = e.changes
  if (e.action === "create") return `drew region “${str(c.title)}”`
  if (e.action === "destroy") return "removed a region"
  if (e.action === "update") return `changed region “${str(c.title) ?? "untitled"}”`
  return `${e.action} a region`
}

/** A sentence for the change feed: "created idea “X”", "moved “X”". */
export function describeEvent(e: GraphEvent, titles: Record<string, string>) {
  switch (e.resource) {
    case "card":
      return describeCard(e, titles)
    case "link":
      return describeLink(e, titles)
    case "region":
      return describeRegion(e)
    default: {
      const _exhaustive: never = e.resource
      return `${e.action} ${_exhaustive}`
    }
  }
}

function toolCard(e: GraphEvent, titles: Record<string, string>): [string, string] {
  const c = e.changes
  const t = (id: unknown) => (typeof id === "string" ? (titles[id] ?? id.slice(0, 8)) : "?")

  switch (e.action) {
    case "create":
      return ["create_card", `${str(c.kind)}: ${t(e.record_id)}`]
    case "move":
      return ["move_card", `${t(e.record_id)} → ${c.x}, ${c.y}`]
    case "archive":
      return ["archive_card", t(e.record_id)]
    case "update": {
      const fields = Object.keys(c)
        .filter((k) => ["title", "body", "tags", "status", "pinned"].includes(k))
        .map((k) => (k === "status" ? `status=${str(c.status)}` : k === "pinned" ? `pinned=${c.pinned}` : k))
      return ["update_card", `${t(e.record_id)}: ${fields.join(", ")}`]
    }
    default:
      return [`card.${e.action}`, t(e.record_id)]
  }
}

/** The MCP tool an agent's event came from, with a short argument summary. */
export function describeTool(e: GraphEvent, titles: Record<string, string>): [string, string] {
  const c = e.changes
  const t = (id: unknown) => (typeof id === "string" ? (titles[id] ?? id.slice(0, 8)) : "?")

  switch (e.resource) {
    case "card":
      return toolCard(e, titles)
    case "link":
      if (e.action === "create") return ["link", `${str(c.type)}: ${t(c.from_card_id)} → ${t(c.to_card_id)}`]
      if (e.action === "destroy") return ["unlink", e.record_id.slice(0, 8)]
      return [`link.${e.action}`, ""]
    case "region":
      if (e.action === "create") return ["create_region", str(c.title) ?? ""]
      if (e.action === "update") return ["update_region", str(c.title) ?? e.record_id.slice(0, 8)]
      if (e.action === "destroy") return ["destroy_region", str(c.title) ?? e.record_id.slice(0, 8)]
      return [`region.${e.action}`, ""]
    default: {
      const _exhaustive: never = e.resource
      return [`${_exhaustive}.${e.action}`, ""]
    }
  }
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
