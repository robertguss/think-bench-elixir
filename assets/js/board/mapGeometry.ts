import type { InternalNode } from "@xyflow/react"
import { CARD_HEIGHT, CARD_WIDTH } from "./types"

export function box(node: InternalNode) {
  const w = node.measured.width ?? CARD_WIDTH
  const h = node.measured.height ?? CARD_HEIGHT
  return { cx: node.internals.positionAbsolute.x + w / 2, cy: node.internals.positionAbsolute.y + h / 2, w, h }
}

/** The point on a's border along the line toward b's centre. */
export function edgePoint(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const s = Math.min(a.w / 2 / Math.abs(dx || 1e-6), a.h / 2 / Math.abs(dy || 1e-6))
  return { x: a.cx + dx * s, y: a.cy + dy * s }
}
