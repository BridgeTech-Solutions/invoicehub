import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/useDebounce'
import * as searchApi from './api'
import type { SearchResults } from './types'

const EMPTY: SearchResults = { clients: [], invoices: [], proformas: [], products: [], total: 0 }

export function useGlobalSearch(q: string) {
  const debounced = useDebounce(q.trim(), 280)

  const query = useQuery({
    queryKey:  ['search', debounced],
    queryFn:   () => searchApi.globalSearch(debounced),
    enabled:   debounced.length >= 2,
    staleTime: 30_000,
    placeholderData: EMPTY,
  })

  return {
    ...query,
    results: query.data ?? EMPTY,
    hasResults: (query.data?.total ?? 0) > 0,
    active: debounced.length >= 2,
  }
}
