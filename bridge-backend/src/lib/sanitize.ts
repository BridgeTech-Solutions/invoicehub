/**
 * @module lib/sanitize
 * Helpers Zod pour nettoyer les entrées texte libres.
 *
 * `safeText(maxLen)` — strip les balises HTML/script et limite la longueur.
 * À utiliser sur tous les champs description, notes, subject, reason, etc.
 */
import { z } from 'zod';

/** Supprime toutes les balises HTML (< ... >) d'une chaîne */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

/**
 * Champ texte sécurisé : supprime les balises HTML et limite à `maxLen` caractères.
 * @param maxLen - Longueur maximale (défaut : 2000)
 */
export function safeText(maxLen = 2_000) {
  return z
    .string()
    .transform(stripHtml)
    .pipe(z.string().max(maxLen));
}

/**
 * Version optionnelle de safeText — retourne undefined si vide après trim.
 */
export function safeTextOptional(maxLen = 2_000) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? stripHtml(v) : v))
    .pipe(z.string().max(maxLen).optional());
}
