import * as fs from 'fs';

type AllowedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

const SIGNATURES: { mime: AllowedMime; check: (buf: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/webp',
    // RIFF....WEBP
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    mime: 'application/pdf',
    check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

/**
 * Lit les 12 premiers octets du fichier et vérifie la signature réelle.
 * Retourne le MIME détecté ou null si non reconnu.
 */
export function detectFileMime(filePath: string): AllowedMime | null {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  for (const sig of SIGNATURES) {
    if (sig.check(buf)) return sig.mime;
  }
  return null;
}

/**
 * Valide qu'un fichier uploadé correspond réellement à un des types autorisés.
 * Supprime le fichier et lance une erreur si la validation échoue.
 */
export function assertFileMime(filePath: string, allowed: AllowedMime[]): void {
  const detected = detectFileMime(filePath);
  if (!detected || !allowed.includes(detected)) {
    fs.unlinkSync(filePath);
    throw new Error(
      `Contenu de fichier invalide. Types acceptés : ${allowed.join(', ')}.`,
    );
  }
}
