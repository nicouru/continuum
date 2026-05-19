import { useCallback } from "react"

export type FloatingPanelPosition = {
  width: number
  x: number
  y: number
}

type MainElementRef = {
  current: HTMLElement | null
}

const EDITOR_MENU_WIDTH = 360
const AI_PANEL_WIDTH = 320
const FLOATING_PANEL_MIN_WIDTH = 240
const EDITOR_MENU_MARGIN = 28
const FLOATING_MENU_CLAMP_MARGIN = 10

export const initialEditorMenuPosition: FloatingPanelPosition = {
  width: EDITOR_MENU_WIDTH,
  x: 0,
  y: 0,
}

export const initialAiPanelPosition: FloatingPanelPosition = {
  width: AI_PANEL_WIDTH,
  x: EDITOR_MENU_MARGIN,
  y: EDITOR_MENU_MARGIN,
}

export function clampFloatingMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const menuWidth = Math.min(
    width,
    window.innerWidth - FLOATING_MENU_CLAMP_MARGIN * 2,
  )
  const menuHeight = Math.min(
    height,
    window.innerHeight - FLOATING_MENU_CLAMP_MARGIN * 2,
  )

  return {
    x: Math.max(
      FLOATING_MENU_CLAMP_MARGIN,
      Math.min(
        x,
        window.innerWidth - menuWidth - FLOATING_MENU_CLAMP_MARGIN,
      ),
    ),
    y: Math.max(
      FLOATING_MENU_CLAMP_MARGIN,
      Math.min(
        y,
        window.innerHeight - menuHeight - FLOATING_MENU_CLAMP_MARGIN,
      ),
    ),
  }
}

export function useFloatingPanelLayout(mainRef: MainElementRef) {
  const getFloatingPanelPosition = useCallback(
    (side: "left" | "right", preferredWidth: number): FloatingPanelPosition => {
      const viewportWidth = window.innerWidth
      const panelWidth = Math.min(
        preferredWidth,
        Math.max(FLOATING_PANEL_MIN_WIDTH, viewportWidth - EDITOR_MENU_MARGIN * 2),
      )
      const mainRect = mainRef.current?.getBoundingClientRect()
      const editorRect = mainRef.current
        ?.querySelector(".continuum-editor-surface .tiptap")
        ?.getBoundingClientRect()
      const y = Math.max(EDITOR_MENU_MARGIN, mainRect?.top ?? EDITOR_MENU_MARGIN)

      if (!editorRect) {
        const x =
          side === "right"
            ? viewportWidth - panelWidth - EDITOR_MENU_MARGIN
            : Math.max(mainRect?.left ?? EDITOR_MENU_MARGIN, EDITOR_MENU_MARGIN)

        return { width: panelWidth, x, y }
      }

      const availableStart =
        side === "right"
          ? editorRect.right + EDITOR_MENU_MARGIN
          : Math.max(mainRect?.left ?? EDITOR_MENU_MARGIN, EDITOR_MENU_MARGIN)
      const availableEnd =
        side === "right"
          ? viewportWidth - EDITOR_MENU_MARGIN
          : editorRect.left - EDITOR_MENU_MARGIN
      const availableWidth = availableEnd - availableStart

      if (availableWidth > 0) {
        const width = Math.max(
          Math.min(preferredWidth, availableWidth),
          Math.min(FLOATING_PANEL_MIN_WIDTH, availableWidth),
        )
        const x = availableStart + Math.max(0, (availableWidth - width) / 2)

        return { width, x, y }
      }

      const x =
        side === "right"
          ? viewportWidth - panelWidth - EDITOR_MENU_MARGIN
          : Math.max(mainRect?.left ?? EDITOR_MENU_MARGIN, EDITOR_MENU_MARGIN)

      return { width: panelWidth, x, y }
    },
    [mainRef],
  )

  const getEditorMenuPosition = useCallback(
    () => getFloatingPanelPosition("right", EDITOR_MENU_WIDTH),
    [getFloatingPanelPosition],
  )

  const getAiPanelPosition = useCallback(
    () => getFloatingPanelPosition("left", AI_PANEL_WIDTH),
    [getFloatingPanelPosition],
  )

  return {
    getAiPanelPosition,
    getEditorMenuPosition,
  }
}
