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
// Factory
// ---------------------------------------------------------------------------

export function getStorageAdapter(): StorageAdapter {
  switch (env.BACKUP_STORAGE_DISK) {
    case 's3':     return new S3Adapter();
    case 'google': return new GCSAdapter();
    case 'azure':  return new AzureAdapter();
    default:       return new LocalAdapter();
  }
}
