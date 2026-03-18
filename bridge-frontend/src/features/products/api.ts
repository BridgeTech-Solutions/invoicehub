import { apiClient } from '@/lib/api-client'
import type {
  Product,
  ProductCategory,
  ProductLineDefaults,
  PaginatedProducts,
  ListProductsParams,
  CreateProductPayload,
  UpdateProductPayload,
  CreateCategoryPayload,
} from './types'

// ─── Catégories ────────────────────────────────────────────────

export async function listCategories(): Promise<ProductCategory[]> {
  const { data } = await apiClient.get('/product-categories')
  return data
}

export async function createCategory(payload: CreateCategoryPayload): Promise<ProductCategory> {
  const { data } = await apiClient.post('/product-categories', payload)
  return data
}

export async function updateCategory(
  id: string,
  payload: Partial<CreateCategoryPayload & { sortOrder?: number; isActive?: boolean }>,
): Promise<ProductCategory> {
  const { data } = await apiClient.put(`/product-categories/${id}`, payload)
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/product-categories/${id}`)
}

// ─── Produits ──────────────────────────────────────────────────

export async function listProducts(params?: ListProductsParams): Promise<PaginatedProducts> {
  const { data } = await apiClient.get('/products', { params })
  return data
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await apiClient.get(`/products/${id}`)
  return data
}

export async function createProduct(payload: CreateProductPayload): Promise<Product> {
  const { data } = await apiClient.post('/products', payload)
  return data
}

export async function updateProduct(id: string, payload: UpdateProductPayload): Promise<Product> {
  const { data } = await apiClient.put(`/products/${id}`, payload)
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`)
}

/**
 * Pré-remplit automatiquement une ligne de document (proforma/facture)
 * avec le dernier prix et la quantité habituels pour ce produit.
 * Si clientId est fourni, prend aussi en compte l'historique client.
 */
export async function getLineDefaults(
  productId: string,
  clientId?: string,
): Promise<ProductLineDefaults> {
  const { data } = await apiClient.get(`/products/${productId}/line-defaults`, {
    params: clientId ? { clientId } : undefined,
  })
  return data
}
