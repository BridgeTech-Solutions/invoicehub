/**
 * @module lib/sanitize
 * Helpers Zod pour nettoyer les entrées texte libres.
 *
 * Deux niveaux de nettoyage :
 *  - `safeText`         — texte pur, supprime TOUT le HTML (champs non-formattés)
 *  - `safeRichText`     — HTML limité à un whitelist sécurisé (descriptions de lignes PDF)
 *
 * Le whitelist HTML autorise uniquement la mise en forme visuelle inoffensive :
 * <br>, <b>, <strong>, <i>, <em>, <u>, <ul>, <ol>, <li>
 * Tout attribut (href=, src=, onerror=, onclick=…) est supprimé.
 */
import { z } from 'zod';

/** Balises HTML autorisées dans les champs rich-text (descriptions de lignes PDF) */
const ALLOWED_TAGS = /^\/?(br|b|strong|i|em|u|ul|ol|li)$/i;

/**
 * Supprime toutes les balises HTML sauf le whitelist.
 * Supprime également tous les attributs (src=, href=, onerror=, onclick=…).
 */
function sanitizeHtml(value: string): string {
  return value
    // Supprimer les balises non whitelistées (avec leurs attributs)
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
      if (ALLOWED_TAGS.test(tag)) {
        // Conserver la balise mais supprimer tous ses attributs
        return match.replace(/\s[^>]*/g, tag.startsWith('/') ? '' : '');
      }
      return ''; // Supprimer la balise entière
    })
    // Supprimer les commentaires HTML <!-- -->
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

/** Supprime TOUT le HTML — pour les champs qui ne doivent jamais contenir de HTML */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

/**
 * Champ texte pur : supprime tout le HTML, limite à `maxLen` caractères.
 * Pour : subject, notes, reason, paymentConditions, warranty, deliveryDelay…
 */
export function safeTextOptional(maxLen = 2_000) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? stripHtml(v) : v))
    .pipe(z.string().max(maxLen).optional());
}

/**
 * Champ rich-text sécurisé : autorise uniquement les balises de mise en forme
 * inoffensives (br, b, i, em, strong, u, ul, ol, li) et supprime tous les attributs.
 * Pour : description de ligne facture/proforma (rendue dans les PDFs Puppeteer).
 */
export function safeRichTextOptional(maxLen = 2_000) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeHtml(v) : v))
    .pipe(z.string().max(maxLen).optional());
}
