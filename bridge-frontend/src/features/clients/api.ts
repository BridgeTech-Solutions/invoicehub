import { apiClient } from '@/lib/api-client'
import type {
  Client,
  ClientSummary,
  ClientQuickFill,
  PaginatedClients,
  ListClientsParams,
  CreateClientPayload,
  UpdateClientPayload,
  ImportClientRow,
  ImportClientResult,
} from './types'

export async function listClients(params?: ListClientsParams): Promise<PaginatedClients> {
  const { data } = await apiClient.get('/clients', { params })
  return data
}

export async function getClient(id: string): Promise<Client> {
  const { data } = await apiClient.get(`/clients/${id}`)
  return data
}

export async function createClient(payload: CreateClientPayload): Promise<Client> {
  const { data } = await apiClient.post('/clients', payload)
  return data
}

export async function updateClient(id: string, payload: UpdateClientPayload): Promise<Client> {
  const { data } = await apiClient.put(`/clients/${id}`, payload)
  return data
}

export async function archiveClient(id: string): Promise<void> {
  await apiClient.delete(`/clients/${id}`)
}

export async function getClientSummary(id: string): Promise<ClientSummary> {
  const { data } = await apiClient.get(`/clients/${id}/summary`)
  return data
}

/**
 * Retourne les suggestions intelligentes pour pré-remplir un nouveau document :
 * - Produits les plus facturés à ce client (avec dernier prix)
 * - Conditions de paiement et remise du dernier document
 * - Solde impayé (alerte rouge si > 0)
 * - Comportement de paiement historique (ponctualité, retard moyen)
 */
export async function getClientQuickFill(id: string): Promise<ClientQuickFill> {
  const { data } = await apiClient.get(`/clients/${id}/quick-fill`)
  return data
}

/** POST /clients/import — crée en masse depuis un tableau de lignes parsées */
export async function importClients(rows: ImportClientRow[]): Promise<ImportClientResult> {
  const { data } = await apiClient.post<ImportClientResult>('/clients/import', { rows })
  return data
}

/** GET /clients?export=csv — télécharge tous les clients (backend, pas de limite de page) */
export async function exportClientsCsv(params?: ListClientsParams): Promise<void> {
  const res = await apiClient.get('/clients', {
    params: { ...params, export: 'csv', page: 1, limit: 10_000 },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }))
  const a   = document.createElement('a')
  a.href = url; a.download = 'clients.csv'; a.click()
  URL.revokeObjectURL(url)
}
