export type SearchEntityType = 'client' | 'invoice' | 'proforma' | 'product'

export interface SearchItem {
  id:      string
  type:    SearchEntityType
  label:   string   // texte principal (nom, numéro document...)
  sub:     string   // texte secondaire (email, client, montant...)
  badge?:  string   // statut
  href:    string   // url de navigation
}

export interface SearchGroup {
  type:  SearchEntityType
  label: string
  items: SearchItem[]
}

export interface SearchResults {
  clients:   SearchItem[]
  invoices:  SearchItem[]
  proformas: SearchItem[]
  products:  SearchItem[]
  total:     number
}
