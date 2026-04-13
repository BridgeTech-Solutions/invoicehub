import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as productsApi from './api'
import type {
  ListProductsParams,
  CreateProductPayload,
  UpdateProductPayload,
  CreateCategoryPayload,
  ImportProductRow,
} from './types'
import type { AxiosError } from 'axios'

export const PRODUCTS_KEYS = {
  categories:   ['products', 'categories']                                          as const,
  list:         (params?: ListProductsParams) => ['products', 'list', params]       as const,
  detail:       (id: string)                  => ['products', 'detail', id]         as const,
  lineDefaults: (productId: string, clientId?: string) =>
    ['products', 'line-defaults', productId, clientId] as const,
}

// ─── Catégories ────────────────────────────────────────────────

export function useProductCategories() {
  return useQuery({
    queryKey: PRODUCTS_KEYS.categories,
    queryFn:  productsApi.listCategories,
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCategoryPayload) => productsApi.createCategory(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEYS.categories })
      toast.success('Catégorie créée')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<CreateCategoryPayload & { sortOrder?: number }>) =>
      productsApi.updateCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEYS.categories })
      toast.success('Catégorie mise à jour')
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productsApi.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEYS.categories })
      toast.success('Catégorie supprimée')
    },
    onError: (error: unknown) => {
      const msg = (error as AxiosError<{ error?: string }>)?.response?.data?.error
      toast.error(msg ?? 'Impossible de supprimer cette catégorie (produits actifs)')
    },
  })
}

// ─── Produits ──────────────────────────────────────────────────

export function useProducts(params?: ListProductsParams) {
  return useQuery({
    queryKey: PRODUCTS_KEYS.list(params),
    queryFn:  () => productsApi.listProducts(params),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: PRODUCTS_KEYS.detail(id),
    queryFn:  () => productsApi.getProduct(id),
    enabled:  !!id,
  })
}

/**
 * Hook utilisé dans les formulaires de création de document (Phase 5/6).
 * Retourne les valeurs par défaut pour pré-remplir une ligne :
 *  - Prix catalogue + dernier prix client
 *  - Quantité habituelle pour ce client
 *  - Alerte si le prix a changé depuis la dernière facture client
 */
export function useProductLineDefaults(productId: string, clientId?: string) {
  return useQuery({
    queryKey: PRODUCTS_KEYS.lineDefaults(productId, clientId),
    queryFn:  () => productsApi.getLineDefaults(productId, clientId),
    enabled:  !!productId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProductPayload) => productsApi.createProduct(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(`Produit "${data.name}" créé`)
    },
    onError: () => toast.error('Erreur lors de la création du produit'),
  })
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateProductPayload) => productsApi.updateProduct(id, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(`"${data.name}" mis à jour`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productsApi.deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produit archivé')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}

export function useImportProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: ImportProductRow[]) => productsApi.importProducts(rows),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(`${result.created} produit${result.created > 1 ? 's' : ''} importé${result.created > 1 ? 's' : ''}`)
    },
    onError: () => toast.error("Erreur lors de l'import"),
  })
}
