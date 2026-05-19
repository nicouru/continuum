import { Extension } from "@tiptap/core"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export type AiSelectionHighlightRange = { from: number; to: number } | null

// External callers (App.tsx) dispatch a transaction with this key to set or
// clear the highlight range. The plugin maps positions through doc changes
// automatically, so callers only need to set the range once per session.
export const aiSelectionHighlightPluginKey =
  new PluginKey<AiSelectionHighlightRange>("aiSelectionHighlight")

export function createAiSelectionHighlightPlugin() {
  return new Plugin<AiSelectionHighlightRange>({
    key: aiSelectionHighlightPluginKey,

    state: {
      init(): AiSelectionHighlightRange {
        return null
      },

      apply(tr, value): AiSelectionHighlightRange {
        const meta = tr.getMeta(aiSelectionHighlightPluginKey) as
          | AiSelectionHighlightRange
          | undefined

        if (meta !== undefined) {
          return meta
        }

        if (!value) {
          return null
        }

        const mappedFrom = tr.mapping.mapResult(value.from)
        const mappedTo = tr.mapping.mapResult(value.to, -1)

        if (mappedFrom.deleted || mappedTo.deleted) {
          return null
        }

        const nextFrom = mappedFrom.pos
        const nextTo = mappedTo.pos

        return nextFrom < nextTo ? { from: nextFrom, to: nextTo } : null
      },
    },

    props: {
      decorations(state) {
        const range = aiSelectionHighlightPluginKey.getState(state)

        if (!range || range.from >= range.to) {
          return DecorationSet.empty
        }

        return DecorationSet.create(state.doc, [
          Decoration.inline(range.from, range.to, {
            class: "continuum-ai-selection-highlight",
          }),
        ])
      },
    },
  })
}

export const AiSelectionHighlightExtension = Extension.create({
  name: "aiSelectionHighlight",

  addProseMirrorPlugins() {
    return [createAiSelectionHighlightPlugin()]
  },
})
