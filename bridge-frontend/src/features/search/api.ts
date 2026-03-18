import { apiClient } from '@/lib/api-client'
import type { SearchItem, SearchResults } from './types'

// ─── Raw shapes returned by the backend ──────────────────────
interface RawClient {
  id: string; name: string; email?: string; phone?: string; city?: string; type?: string; status?: string
}
interface RawInvoice {
  id: string; number: string; status?: string; type?: string; totalTtc?: number
  client?: { id: string; name: string }
}
interface RawProforma {
  id: string; number: string; status?: string; totalTtc?: number
  client?: { id: string; name: string }
}
interface RawProduct {
  id: string; name: string; reference?: string; unitPriceHt?: number; type?: string; unit?: string
}

// ─── Formatters ───────────────────────────────────────────────
function fmt(n?: number) {
  if (n == null) return ''
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(n)
}

function mapClients(raw: RawClient[]): SearchItem[] {
  return raw.map((c) => ({
    id:    c.id,
    type:  'client' as const,
    label: c.name,
    sub:   [c.email, c.city].filter(Boolean).join(' · '),
    badge: c.status,
    href:  `/clients/${c.id}`,
  }))
}

function mapInvoices(raw: RawInvoice[]): SearchItem[] {
  return raw.map((i) => ({
    id:    i.id,
    type:  'invoice' as const,
    label: i.number,
    sub:   [i.client?.name, fmt(i.totalTtc)].filter(Boolean).join(' · '),
    badge: i.status,
    href:  `/invoices/${i.id}`,
  }))
}

function mapProformas(raw: RawProforma[]): SearchItem[] {
  return raw.map((p) => ({
    id:    p.id,
    type:  'proforma' as const,
    label: p.number,
    sub:   [p.client?.name, fmt(p.totalTtc)].filter(Boolean).join(' · '),
    badge: p.status,
    href:  `/proformas/${p.id}`,
  }))
}

function mapProducts(raw: RawProduct[]): SearchItem[] {
  return raw.map((p) => ({
    id:    p.id,
    type:  'product' as const,
    label: p.name,
    sub:   [p.reference, fmt(p.unitPriceHt)].filter(Boolean).join(' · '),
    href:  `/products/${p.id}`,
  }))
}

// ─── Main export ──────────────────────────────────────────────
// The axios interceptor in api-client.ts already unwraps { success, data } → data.
// So after the GET, `data` = { parsed, navigation, results: {...}, total }
export async function globalSearch(q: string, limit = 6): Promise<SearchResults> {
  const { data } = await apiClient.get('/search', {
    params: { q: q.trim(), limit },
  })

  const clients   = mapClients(data?.results?.clients   ?? [])
  const invoices  = mapInvoices(data?.results?.invoices  ?? [])
  const proformas = mapProformas(data?.results?.proformas ?? [])
  const products  = mapProducts(data?.results?.products  ?? [])

  return {
    clients,
    invoices,
    proformas,
    products,
    total: clients.length + invoices.length + proformas.length + products.length,
  }
}
