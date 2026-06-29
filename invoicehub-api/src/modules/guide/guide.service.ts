import * as path from 'path';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';

export const VALID_SECTIONS = new Set([
  'facturation', 'proformas', 'recurrence', 'clients', 'produits',
  'rapports', 'notifications', 'assistant', 'securite', 'audit', 'parametres',
]);

const VIDEOS_DIR = path.resolve(process.cwd(), 'uploads', 'videos');

@Injectable()
export class GuideService {
  ensureDir(): void {
    if (!fs.existsSync(VIDEOS_DIR)) {
      fs.mkdirSync(VIDEOS_DIR, { recursive: true });
    }
  }

  getVideosDir(): string {
    return VIDEOS_DIR;
  }

  findVideoFile(section: string): string | null {
    for (const ext of ['.mp4', '.webm', '.ogv', '.ogg']) {
      const filePath = path.join(VIDEOS_DIR, `${section}${ext}`);
      if (fs.existsSync(filePath)) return `${section}${ext}`;
    }
    return null;
  }

  listVideos(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const section of VALID_SECTIONS) {
      const file = this.findVideoFile(section);
      if (file) {
        // ?v=mtime : casse le cache navigateur quand on remplace la vidéo
        // (même nom de fichier -> sinon l'ancienne version reste affichée).
        const mtime = Math.floor(fs.statSync(path.join(VIDEOS_DIR, file)).mtimeMs);
        result[section] = `uploads/videos/${file}?v=${mtime}`;
      }
    }
    return result;
  }

  async saveVideo(section: string, buffer: Buffer, originalname: string): Promise<string> {
    const ext  = path.extname(originalname).toLowerCase() || '.mp4';
    const dest = path.join(VIDEOS_DIR, `${section}${ext}`);
    // Supprimer l'ancienne vidéo de cette section si elle existe
    await this.deleteVideo(section).catch(() => {});
    await fs.promises.writeFile(dest, buffer);
    return `uploads/videos/${section}${ext}?v=${Date.now()}`;
  }

  deleteVideo(section: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = this.findVideoFile(section);
      if (!file) { resolve(); return; }
      fs.unlink(path.join(VIDEOS_DIR, file), err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
