import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
  collapsed:    boolean
  mobileOpen:   boolean
  setCollapsed:  (v: boolean) => void
  setMobileOpen: (v: boolean) => void
  toggle:        () => void
  toggleMobile:  () => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set, get) => ({
      collapsed:    false,
      mobileOpen:   false,
      setCollapsed:  (v) => set({ collapsed: v }),
      setMobileOpen: (v) => set({ mobileOpen: v }),
      toggle:        () => set({ collapsed: !get().collapsed }),
      toggleMobile:  () => set({ mobileOpen: !get().mobileOpen }),
    }),
    {
      name: 'bts-sidebar',
      partialize: (s) => ({ collapsed: s.collapsed }), // persist collapsed only
    },
  ),
)
