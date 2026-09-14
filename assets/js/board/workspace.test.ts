import { describe, expect, it } from "vitest"
import { initialWorkspace, shouldPublishSelection, workspaceReducer } from "./workspace"

describe("shouldPublishSelection", () => {
  it("always publishes a user action, including empty", () => {
    expect(shouldPublishSelection({ reason: "user", ids: [], published: true, focused: true })).toBe(true)
    expect(shouldPublishSelection({ reason: "user", ids: ["a"], published: false, focused: false })).toBe(true)
  })

  it("does not let an empty unfocused join steal the pointer", () => {
    expect(shouldPublishSelection({ reason: "join", ids: [], published: false, focused: true })).toBe(false)
    expect(shouldPublishSelection({ reason: "join", ids: [], published: false, focused: false })).toBe(false)
    expect(shouldPublishSelection({ reason: "join", ids: ["a"], published: false, focused: false })).toBe(false)
  })

  it("publishes a focused join that already has a selection", () => {
    expect(shouldPublishSelection({ reason: "join", ids: ["a"], published: false, focused: true })).toBe(true)
  })
})

describe("workspaceReducer", () => {
  it("selects, centres with a trail in focus, and steps back", () => {
    let state = initialWorkspace()
    state = workspaceReducer(state, { type: "select", ids: ["a"] })
    expect(state.selection).toEqual(["a"])
    expect(state.focus.id).toBe("a")

    state = workspaceReducer(state, { type: "switchView", view: "focus" })
    state = workspaceReducer(state, { type: "centre", id: "b" })
    expect(state.selection).toEqual(["b"])
    expect(state.focus).toEqual({ id: "b", trail: ["a"] })

    state = workspaceReducer(state, { type: "back", index: 0 })
    expect(state.selection).toEqual(["a"])
    expect(state.focus).toEqual({ id: "a", trail: [] })
  })

  it("drops archived cards from selection and trail", () => {
    let state = initialWorkspace()
    state = workspaceReducer(state, { type: "select", ids: ["a", "b"] })
    state = workspaceReducer(state, { type: "retain", liveIds: new Set(["b"]) })
    expect(state.selection).toEqual(["b"])
    expect(state.focus.id).toBe("b")
  })
})
