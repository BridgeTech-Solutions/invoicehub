export interface ProductCategory {
  id:           string
  name:         string
  description?: string | null
  icon?:        string | null
  color?:       string | null
  sortOrder:    number
  isActive:     boolean
  _count?:      { products: number }
}

export interface Product {
  id:           string
  name:         string
  reference?:   string | null
  description?: string | null
  type:         'service' | 'product'
  unit:         string
  unitPriceHt:  number
  taxRateValue: number
  isActive:     boolean
  categoryId?:  string | null
  category?:    { id: string; name: string; icon?: string | null; color?: string | null } | null
  createdAt:    string
  // Stock fields
  trackStock?:      boolean
  stockQuantity?:   number | null
  stockMinLevel?:   number | null
  stockMaxLevel?:   number | null
  stockUnit?:       string | null
  purchasePriceHt?: number | null  // prix d'achat catalogue (défini sur le produit)
  costPriceHt?:     number | null  // CMUP calculé par les mouvements de stock (read-only)
  stockValue?:      number | null
  imageUrl?:        string | null
  // When fetched with ?clientId= (smart list mode):
  usageCount?:          number
  lastPriceForClient?:  number | null
}

/**
 * Retour de GET /products/:id/line-defaults?clientId=
 * Utilisé pour pré-remplir automatiquement une ligne de document
 * (proforma / facture) avec le dernier prix client + la quantité habituelle.
 */
export interface ProductLineDefaults {
  designation:                  string
  description:                  string | null
  unit:                         string
  unitPriceHt:                  number
  taxRate:                      number
  /** Prix catalogue actuel */
  catalogPrice:                 number
  /** Dernier prix facturé à ce client (null si aucun historique) */
  lastPriceForClient:           number | null
  /** Dernière quantité facturée à ce client */
  lastQuantityForClient:        number | null
  /** Quantité par défaut (dernière ou 1) */
  defaultQuantity:              number
  /** Vrai si le prix catalogue a changé depuis la dernière facture à ce client */
  priceChangedSinceLastInvoice: boolean
  /** Stock disponible (null si le produit ne gère pas le stock) */
  stockQuantity: number | null
}

export interface ListProductsParams {
  page?:       number
  limit?:      number
  categoryId?: string
  type?:       'service' | 'product'
  isActive?:   boolean
  search?:     string
  /** Si fourni : trie les produits par usage décroissant avec ce client */
  clientId?:   string
  trackStock?: boolean
}

export interface PaginatedProducts {
  data:       Product[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface CreateProductPayload {
  name:         string
  type:         'service' | 'product'
  unit:         string
  unitPriceHt:  number
  taxRateValue: number
  reference?:   string
  description?: string
  categoryId?:  string
  taxRateId?:   string
  isActive?:    boolean
  // Stock (ignoré si type='service', filtré côté API)
  trackStock?:      boolean
  purchasePriceHt?: number
  stockUnit?:       string
  stockMinLevel?:   number
  stockMaxLevel?:   number
}

export type UpdateProductPayload = Partial<CreateProductPayload>

export interface CreateCategoryPayload {
  name:         string
  description?: string
  icon?:        string
  color?:       string
  sortOrder?:   number
  isActive?:    boolean
}

// ── Import en masse ───────────────────────────────────────────────────────────

export type ProductUnit = 'heure' | 'jour' | 'forfait' | 'piece' | 'licence' | 'mois' | 'annee'

export interface ImportProductRow {
  name:          string
  reference?:    string
  type?:         'product' | 'service'
  categoryName?: string
  unitPriceHt?:  number
  taxRateValue?: number
  unit?:         ProductUnit
  description?:  string
  isActive?:     boolean
}

export interface ImportProductResult {
  created:    number
  duplicates: { index: number; name: string; reason: string }[]
  errors:     { index: number; name: string; message: string }[]
}

export type ImportRowStatus = 'valid' | 'error' | 'duplicate'

export interface ImportPreviewProductRow extends ImportProductRow {
  _rowIndex: number
  _status:   ImportRowStatus
  _message?: string
}
