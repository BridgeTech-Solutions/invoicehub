/** Réponse API standard */
export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
}

/** Réponse paginée */
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

/** Filtre de liste générique */
export interface ListFilters {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/** Erreur API */
export interface ApiError {
  success: false
  error: string
  details?: Record<string, string[]>
}
