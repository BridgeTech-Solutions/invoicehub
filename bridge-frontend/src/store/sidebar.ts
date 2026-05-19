import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
  collapsed:       boolean
  mobileOpen:      boolean
  overlayPanel:    string | null
  setCollapsed:    (v: boolean) => void
  setMobileOpen:   (v: boolean) => void
  setOverlayPanel: (panel: string | null) => void
  toggle:          () => void
  toggleMobile:    () => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set, get) => ({
      collapsed:       false,
      mobileOpen:      false,
      overlayPanel:    null,
      setCollapsed:    (v) => set({ collapsed: v }),
      setMobileOpen:   (v) => set({ mobileOpen: v }),
      setOverlayPanel: (panel) => set({ overlayPanel: panel }),
      toggle:          () => set({ collapsed: !get().collapsed }),
      toggleMobile:    () => set({ mobileOpen: !get().mobileOpen }),
    }),
    {
      name: 'bts-sidebar',
      partialize: (s) => ({ collapsed: s.collapsed }), // overlayPanel intentionally not persisted
    },
  ),
)
