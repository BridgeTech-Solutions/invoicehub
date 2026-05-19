import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';

export interface StorageAdapter {
  upload(localPath: string, filename: string): Promise<string>;
  getDownloadUrl(storagePath: string): Promise<string | null>;
  getLocalPath(storagePath: string): string | null;
  delete(storagePath: string): Promise<void>;
}

export class LocalAdapter implements StorageAdapter {
  private dir: string;

  constructor(backupDir: string) {
    this.dir = path.resolve(process.cwd(), backupDir);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const dest = path.join(this.dir, filename);
    if (localPath !== dest) {
      fs.copyFileSync(localPath, dest);
      fs.unlinkSync(localPath);
    }
    return dest;
  }

  async getDownloadUrl(_storagePath: string): Promise<null> { return null; }

  getLocalPath(storagePath: string): string { return storagePath; }

  async delete(storagePath: string): Promise<void> {
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
  }
}

export class S3Adapter implements StorageAdapter {
  private bucket: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private endpoint?: string;
  private client!: import('@aws-sdk/client-s3').S3Client;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('S3_BUCKET');
    const region = config.get<string>('S3_REGION');
    const aki    = config.get<string>('S3_ACCESS_KEY_ID');
    const sak    = config.get<string>('S3_SECRET_ACCESS_KEY');
    if (!bucket || !region || !aki || !sak) {
      throw AppError.internal('S3 mal configuré : S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY sont requis');
    }
    this.bucket          = bucket;
    this.region          = region;
    this.accessKeyId     = aki;
    this.secretAccessKey = sak;
    this.endpoint        = config.get<string>('S3_ENDPOINT');
  }

  private async getClient(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region:      this.region,
      credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    });
    return this.client;
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const key    = `backups/${filename}`;
    const stat   = fs.statSync(localPath);
    await client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: createReadStream(localPath),
      ContentLength: stat.size, ContentType: 'application/gzip',
    }));
    fs.unlinkSync(localPath);
    return key;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl }     = await import('@aws-sdk/s3-request-presigner');
    const client = await this.getClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: storagePath }), { expiresIn: 300 });
  }

  getLocalPath(_storagePath: string): null { return null; }

  async delete(storagePath: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storagePath }));
  }
}

export class GCSAdapter implements StorageAdapter {
  private bucket: string;
  private keyFile: string;

  constructor(config: ConfigService) {
    const bucket  = config.get<string>('GCS_BUCKET');
    const keyFile = config.get<string>('GCS_KEY_FILE');
    if (!bucket || !keyFile) throw AppError.internal('GCS mal configuré : GCS_BUCKET et GCS_KEY_FILE sont requis');
    this.bucket  = bucket;
    this.keyFile = keyFile;
  }

  private async getStorage() {
    const { Storage } = await import('@google-cloud/storage');
    return new Storage({ keyFilename: path.resolve(process.cwd(), this.keyFile) });
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
    const [url] = await storage.bucket(this.bucket).file(storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 });
    return url;
  }

  getLocalPath(_storagePath: string): null { return null; }

  async delete(storagePath: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.bucket(this.bucket).file(storagePath).delete();
  }
}

export class AzureAdapter implements StorageAdapter {
  private container: string;
  private connectionString: string;

  constructor(config: ConfigService) {
    const conn      = config.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    const container = config.get<string>('AZURE_STORAGE_CONTAINER');
    if (!conn || !container) throw AppError.internal('Azure mal configuré : AZURE_STORAGE_CONNECTION_STRING et AZURE_STORAGE_CONTAINER sont requis');
    this.connectionString = conn;
    this.container        = container;
  }

  private async getContainerClient() {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    return BlobServiceClient.fromConnectionString(this.connectionString).getContainerClient(this.container);
  }

  async upload(localPath: string, filename: string): Promise<string> {
    const cc       = await this.getContainerClient();
    const blobName = `backups/${filename}`;
    await cc.getBlockBlobClient(blobName).uploadFile(localPath, { blobHTTPHeaders: { blobContentType: 'application/gzip' } });
    fs.unlinkSync(localPath);
    return blobName;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const cc = await this.getContainerClient();
    const { BlobSASPermissions } = await import('@azure/storage-blob');
    return cc.getBlockBlobClient(storagePath).generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn:   new Date(Date.now() + 5 * 60 * 1000),
    });
  }

  getLocalPath(_storagePath: string): null { return null; }

  async delete(storagePath: string): Promise<void> {
    const cc = await this.getContainerClient();
    await cc.getBlockBlobClient(storagePath).deleteIfExists();
  }
}

export function getStorageAdapter(config: ConfigService): StorageAdapter {
  const disk = config.get<string>('BACKUP_STORAGE_DISK', 'local');
  switch (disk) {
    case 's3':     return new S3Adapter(config);
    case 'google': return new GCSAdapter(config);
    case 'azure':  return new AzureAdapter(config);
    default:       return new LocalAdapter(config.get<string>('BACKUP_DIR', './uploads/backups'));
  }
}
