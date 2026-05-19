/**
 * @module modules/backups/storage
 * Adaptateurs de stockage pour les fichiers de backup.
 *
 * Quatre implémentations :
 *  - LocalAdapter  : fichier sur disque local
 *  - S3Adapter     : Amazon S3 / Cloudflare R2 / MinIO (compatible S3)
 *  - GCSAdapter    : Google Cloud Storage
 *  - AzureAdapter  : Microsoft Azure Blob Storage (SharePoint / Microsoft 365)
 */
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';

// ---------------------------------------------------------------------------
// Interface commune
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /** Upload un fichier local vers le stockage. Retourne le chemin/key distant. */
  upload(localPath: string, filename: string): Promise<string>;
  /**
   * Retourne soit un URL signé (S3/GCS) soit `null` (local → streaming direct).
   * Si null, le controller utilisera `getLocalPath()`.
   */
  getDownloadUrl(storagePath: string): Promise<string | null>;
  /** Retourne le chemin local absolu (local seulement, sinon null). */
  getLocalPath(storagePath: string): string | null;
  /** Supprime le fichier du stockage. */
  delete(storagePath: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// LocalAdapter
// ---------------------------------------------------------------------------

export class LocalAdapter implements StorageAdapter {
  private dir: string;

  constructor() {
    this.dir = path.resolve(process.cwd(), env.BACKUP_DIR);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const dest = path.join(this.dir, filename);
    if (localPath !== dest) {
      // fs.renameSync échoue entre deux partitions/disques (EXDEV) — copier puis supprimer
      fs.copyFileSync(localPath, dest);
      fs.unlinkSync(localPath);
    }
    return dest;
  }

  async getDownloadUrl(_storagePath: string): Promise<null> {
    return null; // Streaming direct
  }

  getLocalPath(storagePath: string): string {
    return storagePath;
  }

  async delete(storagePath: string): Promise<void> {
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  }
}

// ---------------------------------------------------------------------------
// S3Adapter (Amazon S3, Cloudflare R2, MinIO)
// ---------------------------------------------------------------------------

export class S3Adapter implements StorageAdapter {
  private bucket: string;
  private client!: import('@aws-sdk/client-s3').S3Client;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw AppError.internal('S3 mal configuré : S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY sont requis');
    }
    this.bucket = env.S3_BUCKET;
  }

  private async getClient(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: env.S3_REGION!,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
    return this.client;
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const key = `backups/${filename}`;
    const fileStream = createReadStream(localPath);
    const stat = fs.statSync(localPath);

    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
      ContentLength: stat.size,
      ContentType: 'application/gzip',
    }));

    fs.unlinkSync(localPath);
    return key;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.getClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storagePath }),
      { expiresIn: 300 }, // 5 minutes
    );
  }

  getLocalPath(_storagePath: string): null {
    return null;
  }

  async delete(storagePath: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storagePath }));
  }
}

// ---------------------------------------------------------------------------
// GCSAdapter (Google Cloud Storage)
// ---------------------------------------------------------------------------

export class GCSAdapter implements StorageAdapter {
  private bucket: string;

  constructor() {
    if (!env.GCS_BUCKET || !env.GCS_KEY_FILE) {
      throw AppError.internal('GCS mal configuré : GCS_BUCKET et GCS_KEY_FILE sont requis');
    }
    this.bucket = env.GCS_BUCKET;
  }

  private async getStorage(): Promise<import('@google-cloud/storage').Storage> {
    const { Storage } = await import('@google-cloud/storage');
    return new Storage({ keyFilename: path.resolve(process.cwd(), env.GCS_KEY_FILE!) });
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const storage = await this.getStorage();
    const key = `backups/${filename}`;
    await storage.bucket(this.bucket).upload(localPath, { destination: key });
    fs.unlinkSync(localPath);
    return key;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const storage = await this.getStorage();
    const [url] = await storage
      .bucket(this.bucket)
      .file(storagePath)
      .getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 });
    return url;
  }

  getLocalPath(_storagePath: string): null {
    return null;
  }

  async delete(storagePath: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.bucket(this.bucket).file(storagePath).delete();
  }
}

// ---------------------------------------------------------------------------
// AzureAdapter (Microsoft Azure Blob Storage)
// ---------------------------------------------------------------------------

export class AzureAdapter implements StorageAdapter {
  private container: string;

  constructor() {
    if (!env.AZURE_STORAGE_CONNECTION_STRING || !env.AZURE_STORAGE_CONTAINER) {
      throw AppError.internal('Azure mal configuré : AZURE_STORAGE_CONNECTION_STRING et AZURE_STORAGE_CONTAINER sont requis');
    }
    this.container = env.AZURE_STORAGE_CONTAINER;
  }

  private async getContainerClient(): Promise<import('@azure/storage-blob').ContainerClient> {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const serviceClient = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING!);
    return serviceClient.getContainerClient(this.container);
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const containerClient = await this.getContainerClient();
    const blobName = `backups/${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadFile(localPath, {
      blobHTTPHeaders: { blobContentType: 'application/gzip' },
    });

    fs.unlinkSync(localPath);
    return blobName;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import('@azure/storage-blob');
    const containerClient = await this.getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(storagePath);

    // URL SAS valide 5 minutes
    const sasUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + 5 * 60 * 1000),
    });

    return sasUrl;
  }

  getLocalPath(_storagePath: string): null {
    return null;
  }

  async delete(storagePath: string): Promise<void> {
    const containerClient = await this.getContainerClient();
    await containerClient.getBlockBlobClient(storagePath).deleteIfExists();
  }
}

// ---------------------------------------------------------------------------
// OneDriveAdapter (Microsoft OneDrive for Business — Microsoft Graph API)
// ---------------------------------------------------------------------------
//
// Prérequis Azure AD :
//   1. App Registration → noter client_id + tenant_id
//   2. Certificats & secrets → créer un secret → noter client_secret
//   3. API permissions → Microsoft Graph → Files.ReadWrite.All (Application) → Accorder
//
// Variables .env requises :
//   BACKUP_STORAGE_DISK=onedrive
//   ONEDRIVE_TENANT_ID=<votre-tenant-id>
//   ONEDRIVE_CLIENT_ID=<client-id-app>
//   ONEDRIVE_CLIENT_SECRET=<client-secret>
//   ONEDRIVE_DRIVE_ID=<drive-id>          # optionnel
//   ONEDRIVE_FOLDER_PATH=InvoiceHub/Backups  # optionnel

export class OneDriveAdapter implements StorageAdapter {
  private readonly tenantId:     string;
  private readonly clientId:     string;
  private readonly clientSecret: string;
  private readonly driveId:      string;
  private readonly folderPath:   string;

  // Cache du token OAuth2 (expire ~1h côté Microsoft)
  private tokenCache: { token: string; expiresAt: number } | null = null;

  // Taille des chunks d'upload : 5 MB (doit être multiple de 320 KB)
  private static readonly CHUNK_SIZE = 5 * 320 * 1024; // 1 638 400 octets ≈ 1,6 MB

  constructor() {
    if (!env.ONEDRIVE_TENANT_ID || !env.ONEDRIVE_CLIENT_ID || !env.ONEDRIVE_CLIENT_SECRET) {
      throw AppError.internal(
        'OneDrive mal configuré : ONEDRIVE_TENANT_ID, ONEDRIVE_CLIENT_ID et ONEDRIVE_CLIENT_SECRET sont requis',
      );
    }
    this.tenantId     = env.ONEDRIVE_TENANT_ID;
    this.clientId     = env.ONEDRIVE_CLIENT_ID;
    this.clientSecret = env.ONEDRIVE_CLIENT_SECRET;
    this.driveId      = env.ONEDRIVE_DRIVE_ID ?? '';
    this.folderPath   = env.ONEDRIVE_FOLDER_PATH;
  }

  // ── OAuth2 client credentials ─────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    // Retourner le token en cache s'il est valide encore 60 secondes
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }

    const url  = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      scope:         'https://graph.microsoft.com/.default',
    });

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw AppError.internal(`OneDrive auth échouée (${res.status}) : ${text}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = {
      token:     data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  // ── URL racine du drive Microsoft Graph ───────────────────────────────────

  private driveRoot(): string {
    return this.driveId
      ? `https://graph.microsoft.com/v1.0/drives/${this.driveId}`
      : 'https://graph.microsoft.com/v1.0/me/drive';
  }

  // ── Upload via session (supporte n'importe quelle taille) ────────────────

  async upload(localPath: string, filename: string): Promise<string> {
    const token      = await this.getAccessToken();
    const remotePath = `${this.folderPath}/${filename}`;

    // 1. Créer la session d'upload
    const sessionRes = await fetch(
      `${this.driveRoot()}/root:/${encodeURIComponent(remotePath)}:/createUploadSession`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
      },
    );

    if (!sessionRes.ok) {
      throw AppError.internal(
        `OneDrive createUploadSession (${sessionRes.status}) : ${await sessionRes.text()}`,
      );
    }

    const { uploadUrl } = await sessionRes.json() as { uploadUrl: string };

    // 2. Upload en chunks depuis un stream (ne charge pas tout en mémoire)
    const stat      = fs.statSync(localPath);
    const totalSize = stat.size;
    const fd        = fs.openSync(localPath, 'r');
    const chunkBuf  = Buffer.allocUnsafe(OneDriveAdapter.CHUNK_SIZE);

    try {
      let offset = 0;
      while (offset < totalSize) {
        const bytesRead = fs.readSync(fd, chunkBuf, 0, OneDriveAdapter.CHUNK_SIZE, offset);
        const chunk     = chunkBuf.slice(0, bytesRead);
        const end       = offset + bytesRead - 1;

        const chunkRes = await fetch(uploadUrl, {
          method:  'PUT',
          headers: {
            'Content-Length': String(bytesRead),
            'Content-Range':  `bytes ${offset}-${end}/${totalSize}`,
            'Content-Type':   'application/octet-stream',
          },
          body: chunk,
        });

        // 202 Accepted = chunk reçu, continuer ; 201/200 = upload terminé
        if (!chunkRes.ok && chunkRes.status !== 202) {
          throw AppError.internal(
            `OneDrive upload chunk (${chunkRes.status}) : ${await chunkRes.text()}`,
          );
        }

        offset += bytesRead;
      }
    } finally {
      fs.closeSync(fd);
    }

    fs.unlinkSync(localPath);
    return remotePath;
  }

  // ── Lien de téléchargement temporaire (1 heure, portée organisation) ─────

  async getDownloadUrl(storagePath: string): Promise<string> {
    const token = await this.getAccessToken();

    const res = await fetch(
      `${this.driveRoot()}/root:/${encodeURIComponent(storagePath)}:/createLink`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:               'view',
          scope:              'organization',
          expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      },
    );

    if (!res.ok) {
      throw AppError.internal(`OneDrive createLink (${res.status}) : ${await res.text()}`);
    }

    const data = await res.json() as { link: { webUrl: string } };
    return data.link.webUrl;
  }

  getLocalPath(_storagePath: string): null {
    return null;
  }

  // ── Suppression ───────────────────────────────────────────────────────────

  async delete(storagePath: string): Promise<void> {
    const token = await this.getAccessToken();

    const res = await fetch(
      `${this.driveRoot()}/root:/${encodeURIComponent(storagePath)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );

    // 204 = supprimé avec succès, 404 = déjà absent — les deux sont acceptables
    if (!res.ok && res.status !== 404 && res.status !== 204) {
      throw AppError.internal(`OneDrive delete (${res.status}) : ${await res.text()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getStorageAdapter(): StorageAdapter {
  switch (env.BACKUP_STORAGE_DISK) {
    case 's3':       return new S3Adapter();
    case 'google':   return new GCSAdapter();
    case 'azure':    return new AzureAdapter();
    case 'onedrive': return new OneDriveAdapter();
    default:         return new LocalAdapter();
  }
}
