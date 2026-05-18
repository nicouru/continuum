import type { Editor } from "@tiptap/core"
import { useEffect, useState } from "react"

export function useEditorRevision(editor: Editor | null) {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!editor) {
      return
    }

    const bumpRevision = () => setRevision((value) => value + 1)

    editor.on("selectionUpdate", bumpRevision)
    editor.on("update", bumpRevision)
    bumpRevision()

    return () => {
      editor.off("selectionUpdate", bumpRevision)
      editor.off("update", bumpRevision)
    }
  }, [editor])

  return revision
}
