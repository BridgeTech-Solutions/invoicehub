import { apiClient } from '@/lib/api-client'
import type {
  Client,
  ClientSummary,
  ClientQuickFill,
  PaginatedClients,
  ListClientsParams,
  CreateClientPayload,
  UpdateClientPayload,
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
