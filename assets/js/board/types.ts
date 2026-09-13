// Shapes sent by ThinkBenchWeb.GraphChannel (see ThinkBench.Mcp.Json).

export const KINDS = ["idea", "question", "decision", "source", "objection"] as const
export type Kind = (typeof KINDS)[number]

export const LINK_TYPES = [
  "answers",
  "resolves",
  "raised-by",
  "follows-from",
  "depends-on",
  "challenges",
  "cites",
] as const

export type Card = {
  id: string
  kind: Kind
  title: string
  body?: string
  tags: string[]
  status: "open" | "resolved"
  x: number
  y: number
  created_by: string
  archived?: boolean
}

export type Link = { id: string; from: string; to: string; type: string }

export type Region = { id: string; title: string; x: number; y: number; w: number; h: number }

export type Actor = { name: string; kind: "human" | "agent" }

export type GraphEvent = {
  seq: number
  actor: string
  resource: "card" | "link" | "region"
  action: string
  record_id: string
  changes: Record<string, unknown>
  at: string
}

export type Look = { actor: string; seq: number; at: string }

export type JoinReply = {
  session_id: string
  latest_seq: number
  cards: Card[]
  links: Link[]
  regions: Region[]
  events: GraphEvent[]
  actors: Actor[]
  look: Look | null
}

export type EventPush = {
  event: GraphEvent
  card?: Card
  link?: Link
  region?: Region
  removed?: { resource: GraphEvent["resource"]; id: string }
}

export type Move = { id: string; x: number; y: number }
