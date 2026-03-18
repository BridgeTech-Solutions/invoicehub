export type BackupStatus = 'pending' | 'running' | 'success' | 'failed'

export interface Backup {
  id:               string
  filename:         string
  storageDisk:      string
  storagePath:      string | null
  sizeBytes:        number | null
  sizeMb:           string | null
  status:           BackupStatus
  errorMessage:     string | null
  createdAt:        string
  completedAt:      string | null
  durationSeconds:  number | null
  createdBy: {
    firstName: string
    lastName:  string
    email:     string
  }
}

export interface PaginatedBackups {
  data:       Backup[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListBackupsParams {
  page?:   number
  limit?:  number
  status?: BackupStatus
}
