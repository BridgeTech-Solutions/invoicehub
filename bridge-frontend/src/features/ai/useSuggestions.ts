'use client'

import {
  BarChart3, AlertTriangle, Users, ScanSearch,
  FileQuestion, FilePlus, Receipt, CreditCard,
  Package, Settings, Clock, TrendingUp,
  type LucideIcon,
} from 'lucide-react'

export interface Suggestion {
  icon:   LucideIcon
  color:  string
  bg:     string
  label:  string
  prompt: string
}

// ─── Catalogue de toutes les suggestions disponibles ───────────────────────

const S = {
  ca:          { icon: BarChart3,     color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)',   label: 'CA du mois',            prompt: "Quel est notre chiffre d'affaires ce mois ?" },
  anomalies:   { icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   label: 'Anomalies',             prompt: 'Y a-t-il des anomalies dans les données récentes ?' },
  topClients:  { icon: Users,         color: '#10b981', bg: 'rgba(16,185,129,0.08)',  label: 'Meilleurs clients',     prompt: 'Qui sont nos 5 meilleurs clients ?' },
  scan:        { icon: ScanSearch,    color: '#d97706', bg: 'rgba(217,119,6,0.08)',   label: 'Vue d\'ensemble',       prompt: 'Donne-moi un résumé global de la situation financière' },
  avoir:       { icon: FileQuestion,  color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: "C'est quoi un avoir",   prompt: "C'est quoi une facture avoir ?" },
  newProforma: { icon: FilePlus,      color: '#0891b2', bg: 'rgba(8,145,178,0.08)',  label: 'Créer une proforma',    prompt: 'Comment créer une proforma rapidement ?' },
  retard:      { icon: Clock,         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Factures en retard',    prompt: 'Montre-moi les factures en retard' },
  impayes:     { icon: Receipt,       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  label: 'Factures impayées',     prompt: 'Quelles sont les factures non encore payées ?' },
  paiements:   { icon: CreditCard,    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  label: 'Paiements récents',     prompt: 'Quels sont les derniers paiements reçus ?' },
  catalogue:   { icon: Package,       color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: 'Catalogue produits',    prompt: 'Montre-moi le catalogue des produits et services avec les prix' },
  evolution:   { icon: TrendingUp,    color: '#14b8a6', bg: 'rgba(20,184,166,0.08)', label: 'Évolution CA',          prompt: "Quelle est l'évolution du CA par rapport au mois précédent ?" },
  config:      { icon: Settings,      color: '#6b7280', bg: 'rgba(107,114,128,0.08)', label: 'Configuration TVA',    prompt: 'Quel est le taux de TVA configuré et comment ça fonctionne ?' },
} satisfies Record<string, Suggestion>

// ─── Mapping pathname → suggestions ────────────────────────────────────────

function getSuggestionsForPath(pathname: string): Suggestion[] {
  // /invoices/[id] — détail d'une facture
  if (/^\/invoices\/[^/]+$/.test(pathname)) {
    return [S.paiements, S.impayes, S.anomalies, S.topClients]
  }
  // /invoices — liste des factures
  if (pathname === '/invoices') {
    return [S.retard, S.impayes, S.evolution, S.anomalies, S.ca, S.topClients]
  }
  // /proformas/[id]
  if (/^\/proformas\/[^/]+$/.test(pathname)) {
    return [S.newProforma, S.topClients, S.ca, S.anomalies]
  }
  // /proformas
  if (pathname === '/proformas') {
    return [S.newProforma, S.topClients, S.impayes, S.ca, S.anomalies, S.avoir]
  }
  // /clients/[id]
  if (/^\/clients\/[^/]+$/.test(pathname)) {
    return [S.topClients, S.impayes, S.paiements, S.anomalies]
  }
  // /clients
  if (pathname === '/clients') {
    return [S.topClients, S.impayes, S.paiements, S.ca, S.anomalies, S.scan]
  }
  // /payments
  if (pathname === '/payments') {
    return [S.paiements, S.impayes, S.retard, S.ca, S.topClients, S.anomalies]
  }
  // /products
  if (pathname === '/products' || pathname === '/product-categories') {
    return [S.catalogue, S.ca, S.topClients, S.scan, S.anomalies, S.newProforma]
  }
  // /settings
  if (pathname.startsWith('/settings')) {
    return [S.config, S.avoir, S.newProforma, S.ca, S.anomalies, S.scan]
  }
  // /dashboard — par défaut
  return [S.ca, S.retard, S.topClients, S.anomalies, S.evolution, S.scan]
}

// ─── Hook public ──────────────────────────────────────────────────────────

/**
 * Retourne des suggestions contextuelles selon la page active.
 * - `suggestions` : liste complète avec icônes (pour la page /assistant)
 * - `quick`       : labels courts (pour le widget flottant)
 */
export function useSuggestions(pathname: string | null) {
  const suggestions = getSuggestionsForPath(pathname ?? '/dashboard')
  const quick = suggestions.slice(0, 5).map(s => s.label)
  return { suggestions, quick }
}
