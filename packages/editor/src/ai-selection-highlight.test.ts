import { describe, expect, it } from "vitest"
import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import {
  aiSelectionHighlightPluginKey,
  createAiSelectionHighlightPlugin,
} from "./ai-selection-highlight"

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
  },
  marks: {},
})

function makeState() {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hola mundo")]),
    ]),
    plugins: [createAiSelectionHighlightPlugin()],
  })
}

describe("AiSelectionHighlightExtension", () => {
  it("starts with no highlight", () => {
    const state = makeState()
    expect(aiSelectionHighlightPluginKey.getState(state)).toBeNull()
  })

  it("sets and retrieves a highlight range via transaction metadata", () => {
    let state = makeState()
    state = state.apply(
      state.tr.setMeta(aiSelectionHighlightPluginKey, { from: 1, to: 5 }),
    )
    expect(aiSelectionHighlightPluginKey.getState(state)).toEqual({
      from: 1,
      to: 5,
    })
  })

  it("clears the highlight when null is dispatched", () => {
    let state = makeState()
    state = state.apply(
      state.tr.setMeta(aiSelectionHighlightPluginKey, { from: 1, to: 5 }),
    )
    state = state.apply(state.tr.setMeta(aiSelectionHighlightPluginKey, null))
    expect(aiSelectionHighlightPluginKey.getState(state)).toBeNull()
  })

  it("maps positions forward when text is inserted before the range", () => {
    let state = makeState()
    state = state.apply(
      state.tr.setMeta(aiSelectionHighlightPluginKey, { from: 1, to: 6 }),
    )
    state = state.apply(state.tr.insertText("XX", 1))
    expect(aiSelectionHighlightPluginKey.getState(state)).toEqual({
      from: 3,
      to: 8,
    })
  })

  it("clears the highlight when the highlighted range is deleted", () => {
    let state = makeState()
    state = state.apply(
      state.tr.setMeta(aiSelectionHighlightPluginKey, { from: 1, to: 6 }),
    )
    state = state.apply(state.tr.delete(1, 6))
    expect(aiSelectionHighlightPluginKey.getState(state)).toBeNull()
  })
})
