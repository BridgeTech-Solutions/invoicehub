import apiClient from '@/lib/api-client'

export interface Unit {
  id:          string
  code:        string
  label:       string
  labelPlural: string | null
  showOnPdf:   boolean
  isActive:    boolean
  sortOrder:   number
}

export const unitsApi = {
  list: async (all = false): Promise<Unit[]> => {
    const { data } = await apiClient.get<{ data: Unit[] }>('/units', { params: all ? { all: 'true' } : {} })
    return data.data ?? data as any
  },
  create: async (payload: Omit<Unit, 'id'>): Promise<Unit> => {
    const { data } = await apiClient.post<{ data: Unit }>('/units', payload)
    return data.data ?? data as any
  },
  update: async (id: string, payload: Partial<Omit<Unit, 'id'>>): Promise<Unit> => {
    const { data } = await apiClient.put<{ data: Unit }>(`/units/${id}`, payload)
    return data.data ?? data as any
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/units/${id}`)
  },
  reorder: async (items: { id: string; sortOrder: number }[]): Promise<void> => {
    await apiClient.post('/units/reorder', { items })
  },
}
