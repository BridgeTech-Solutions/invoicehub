import path from 'path';
import fs from 'fs';

export const VALID_SECTIONS = new Set([
  'facturation', 'proformas', 'recurrence', 'clients', 'produits',
  'rapports', 'notifications', 'assistant', 'securite', 'audit', 'parametres',
]);

const VIDEOS_DIR = path.resolve(process.cwd(), 'uploads', 'videos');

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
      if (file) result[section] = `uploads/videos/${file}`;
    }
    return result;
  }

  deleteVideo(section: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = this.findVideoFile(section);
      if (!file) { resolve(); return; }
      fs.unlink(path.join(VIDEOS_DIR, file), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const guideService = new GuideService();
