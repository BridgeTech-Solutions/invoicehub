import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
  collapsed:       boolean
  mobileOpen:      boolean
  overlayPanel:    string | null
  openSections:    Record<string, boolean>
  setCollapsed:    (v: boolean) => void
  setMobileOpen:   (v: boolean) => void
  setOverlayPanel: (panel: string | null) => void
  toggle:          () => void
  toggleMobile:    () => void
  openSection:     (title: string) => void
  toggleSection:   (title: string) => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set, get) => ({
      collapsed:       false,
      mobileOpen:      false,
      overlayPanel:    null,
      openSections:    {},
      setCollapsed:    (v) => set({ collapsed: v }),
      setMobileOpen:   (v) => set({ mobileOpen: v }),
      setOverlayPanel: (panel) => set({ overlayPanel: panel }),
      toggle:          () => set({ collapsed: !get().collapsed }),
      toggleMobile:    () => set({ mobileOpen: !get().mobileOpen }),
      openSection:     (title) => set(s => ({ openSections: { ...s.openSections, [title]: true } })),
      toggleSection:   (title) => set(s => ({ openSections: { ...s.openSections, [title]: !s.openSections[title] } })),
    }),
    {
      name: 'bts-sidebar',
      partialize: (s) => ({ collapsed: s.collapsed, openSections: s.openSections }),
    },
  ),
)
