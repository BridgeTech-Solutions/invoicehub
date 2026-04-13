import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notificationsApi } from './api'
import type { ListNotificationsParams, NotificationSetting } from './types'

const KEYS = {
  all:      ['notifications'] as const,
  list:     (p: ListNotificationsParams) => ['notifications', 'list', p] as const,
  settings: ['notifications', 'settings'] as const,
}

// ─── useNotifications ─────────────────────────────────────────
export function useNotifications(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey:  KEYS.list(params),
    queryFn:   () => notificationsApi.list(params),
    staleTime: 30_000,
  })
}

// ─── useNotificationsInfinite — for topbar dropdown ───────────
export function useNotificationsInfinite() {
  return useInfiniteQuery({
    queryKey:         [...KEYS.all, 'infinite'],
    queryFn:          ({ pageParam = 1 }) => notificationsApi.list({ page: pageParam as number, limit: 10 }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.page < last.totalPages ? last.page + 1 : undefined,
    staleTime:        20_000,
  })
}

// ─── useUnreadCount — for bell badge ──────────────────────────
export function useUnreadCount() {
  const { data } = useNotifications({ page: 1, limit: 1 })
  return data?.unreadCount ?? 0
}

// ─── useMarkRead ──────────────────────────────────────────────
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

// ─── useMarkAllRead ───────────────────────────────────────────
export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Toutes les notifications marquées comme lues')
    },
  })
}

// ─── useNotificationSettings ──────────────────────────────────
export function useNotificationSettings() {
  return useQuery({
    queryKey: KEYS.settings,
    queryFn:  notificationsApi.getSettings,
    staleTime: 60_000,
  })
}

// ─── useUpdateNotificationSettings ───────────────────────────
export function useUpdateNotificationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: NotificationSetting[]) => notificationsApi.updateSettings(settings),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.settings })
      toast.success('Préférences de notifications sauvegardées')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })
}

// ─── useDisableAllNotifications ───────────────────────────────
export function useDisableAllNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.disableAll(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.settings })
      toast.success('Toutes les notifications ont été désactivées')
    },
    onError: () => toast.error('Erreur lors de la désactivation'),
  })
}

// ─── useEnableAllNotifications ────────────────────────────────
export function useEnableAllNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.enableAll(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.settings })
      toast.success('Toutes les notifications ont été réactivées')
    },
    onError: () => toast.error('Erreur lors de la réactivation'),
  })
}
