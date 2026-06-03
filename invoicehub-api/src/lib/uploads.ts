import * as path from 'path';

/**
 * Helpers de stockage des pièces jointes (justificatifs, documents fournisseurs…).
 *
 * On enregistre en base un chemin RELATIF au répertoire de travail
 * (ex. "uploads/payments/<uuid>.pdf"), jamais un chemin absolu. Cela rend les
 * références portables : déplacer le projet, changer de serveur ou passer en
 * conteneur Docker (où le chemin absolu diffère) ne casse pas les liens.
 *
 * La lecture reste rétrocompatible : un chemin absolu hérité (ancien stockage)
 * est résolu tel quel, un chemin relatif récent est résolu depuis le cwd.
 */

/** Convertit un chemin absolu (multer `file.path`) en chemin relatif stockable en base. */
export function toRelativeUpload(absolutePath: string): string {
  const rel = path.relative(process.cwd(), absolutePath);
  // Normalise les séparateurs en '/' pour rester cohérent entre Windows et Linux.
  return rel.split(path.sep).join('/');
}

/** Résout un chemin stocké (relatif récent OU absolu hérité) en chemin absolu pour `fs`. */
export function resolveUpload(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
}
