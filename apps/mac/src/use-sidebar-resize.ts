import { useCallback, type MouseEvent as ReactMouseEvent } from "react"
import { clampSidebarWidth } from "./use-continuum-preferences-state"

type UseSidebarResizeOptions = {
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  commitSidebarWidth: (width: number) => void
}

export function useSidebarResize({
  sidebarWidth,
  setSidebarWidth,
  commitSidebarWidth,
}: UseSidebarResizeOptions) {
  return useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = sidebarWidth
      document.body.classList.add("continuum-sidebar-is-resizing")

      const handleMove = (moveEvent: MouseEvent) => {
        setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX))
      }

      const handleUp = (upEvent: MouseEvent) => {
        commitSidebarWidth(startWidth + upEvent.clientX - startX)
        document.body.classList.remove("continuum-sidebar-is-resizing")
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)
      }

      window.addEventListener("mousemove", handleMove)
      window.addEventListener("mouseup", handleUp)
    },
    [commitSidebarWidth, setSidebarWidth, sidebarWidth],
  )
}
