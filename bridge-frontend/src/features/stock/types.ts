export type StockMovementType =
  | 'purchase_receipt'
  | 'sale'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'write_off'
  | 'return_supplier'
  | 'return_customer'
  | 'initial_stock'
  | 'transfer_in'
  | 'transfer_out'

export type StockStatus = 'normal' | 'bas' | 'rupture' | 'surstock'

export interface StockSummary {
  totalTrackedProducts: number
  rupture:              number
  lowStock:             number
  surstock:             number
  totalStockValue:      number
  lastMovements: {
    id:        string
    type:      StockMovementType
    quantity:  number
    createdAt: string
    product:   { id: string; name: string }
  }[]
}

export interface StockLevel {
  id:            string
  name:          string
  reference?:    string | null
  barcode?:      string | null
  imageUrl?:     string | null
  stockQuantity: number
  stockMinLevel: number | null
  stockMaxLevel: number | null
  stockUnit?:    string | null
  costPriceHt:   number | null
  stockValue:    number
  stockStatus:   StockStatus
  category?:     { id: string; name: string; color?: string | null } | null
}

export interface StockMovement {
  id:             string
  type:           StockMovementType
  quantity:       number
  quantityBefore: number
  quantityAfter:  number
  unitCostHt:     number | null
  totalCostHt:    number | null
  sourceType?:    string | null
  sourceId?:      string | null
  sourceLabel?:   string | null
  location?:      string | null
  notes?:         string | null
  createdAt:      string
  product:        { id: string; name: string; reference?: string | null; stockUnit?: string | null; unit?: string | null }
  createdBy:      { id: string; firstName: string; lastName: string }
}

export interface StockAlert {
  id:            string
  name:          string
  reference?:    string | null
  imageUrl?:     string | null
  stockQuantity: number
  stockMinLevel: number | null
  stockMaxLevel: number | null
  stockStatus:   'rupture' | 'bas'
  deficit:       number
  category?:     { id: string; name: string; color?: string | null } | null
}

export interface ProductStockHistory {
  product: {
    id:            string
    name:          string
    reference?:    string | null
    stockQuantity: number
    costPriceHt:   number | null
    stockValue:    number
    stockMinLevel: number | null
    stockMaxLevel: number | null
    stockUnit?:    string | null
  }
  movements:  StockMovement[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface PaginatedStockLevels {
  data:       StockLevel[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface PaginatedMovements {
  data:       StockMovement[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface AdjustStockPayload {
  productId:   string
  quantity:    number
  type:        'adjustment_in' | 'adjustment_out' | 'write_off' | 'initial_stock' | 'return_customer' | 'return_supplier' | 'purchase_receipt'
  unitCostHt?: number | null
  notes:       string
  location?:   string | null
  sourceLabel?: string | null
}

export interface ListMovementsParams {
  page?:       number
  limit?:      number
  productId?:  string
  type?:       StockMovementType
  dateFrom?:   string
  dateTo?:     string
  sourceType?: string
}

export interface ListLevelsParams {
  page?:       number
  limit?:      number
  search?:     string
  lowStock?:   boolean
  rupture?:    boolean
  categoryId?: string
}
