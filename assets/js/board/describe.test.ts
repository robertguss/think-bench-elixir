import { describe, expect, it } from "vitest"
import { describeEvent, describeTool } from "./describe"
import type { GraphEvent } from "./types"

const ev = (extra: Partial<GraphEvent>): GraphEvent => ({
  seq: 1,
  actor: "claude-code",
  resource: "card",
  action: "create",
  record_id: "c1",
  changes: {},
  at: "2026-01-01T00:00:00Z",
  ...extra,
})

describe("describeEvent", () => {
  it("names card, link and region actions", () => {
    const titles = { c1: "Voice", c2: "Board" }
    expect(describeEvent(ev({ changes: { kind: "idea", title: "Voice" } }), titles)).toBe('created idea “Voice”')
    expect(describeEvent(ev({ action: "archive" }), titles)).toBe('archived “Voice”')
    expect(
      describeEvent(ev({ resource: "link", action: "create", changes: { from_card_id: "c1", to_card_id: "c2", type: "answers" } }), titles),
    ).toBe('linked “Voice” answers “Board”')
    expect(describeEvent(ev({ resource: "region", action: "destroy" }), titles)).toBe("removed a region")
    expect(describeEvent(ev({ resource: "region", action: "update", changes: { title: "Capture" } }), titles)).toBe(
      'changed region “Capture”',
    )
  })
})

describe("describeTool", () => {
  it("maps events back to tool names", () => {
    const titles = { c1: "Voice" }
    expect(describeTool(ev({ action: "archive" }), titles)).toEqual(["archive_card", "Voice"])
    expect(describeTool(ev({ resource: "link", action: "destroy" }), titles)[0]).toBe("unlink")
    expect(describeTool(ev({ resource: "region", action: "create", changes: { title: "R" } }), titles)).toEqual([
      "create_region",
      "R",
    ])
    expect(describeTool(ev({ resource: "region", action: "update", changes: { title: "R" } }), titles)[0]).toBe(
      "update_region",
    )
    expect(describeTool(ev({ resource: "region", action: "destroy" }), titles)[0]).toBe("destroy_region")
  })
})
