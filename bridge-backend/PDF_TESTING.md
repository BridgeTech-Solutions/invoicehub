# PDF Generation — Test Log

Ce fichier trace les tests effectués sur la génération PDF (Puppeteer) pour ne pas répéter les mêmes vérifications.

---

## Environnement

- **Moteur** : Puppeteer (Chromium headless) via `src/lib/pdf.ts`
- **Script de test** : `test_pdf_many_lines.ts` (20 lignes produit, 2 pages)
- **Commande** :
  ```bash
  cd bridge-backend
  DATABASE_URL="postgresql://x:x@localhost/x" \
  JWT_ACCESS_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  JWT_REFRESH_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  npx tsx test_pdf_many_lines.ts
  ```
- **Sortie** : `test_facture_many_lines.pdf`
- **Prérequis Chrome** : `npx puppeteer browsers install chrome` (à faire une seule fois)

---

## Tests effectués

### TEST-01 — Footer absent sur page 1 (multi-page) ✅ RÉSOLU
**Date** : 2026-03-18
**Symptôme** : Sur une facture avec beaucoup de lignes (2+ pages), le footer n'apparaissait que sur la dernière page. La page 1 n'avait pas de footer visible.
**Cause** : Le footer utilisait `position: fixed` dans le body HTML. En mode impression Puppeteer, `position: fixed` **ne se répète pas** sur les pages suivantes.
**Solution** :
1. Cacher `.page-header` et `.page-footer` du body via `page.evaluate()` (pour éviter le doublon)
2. Mettre le footer dans `footerTemplate` de `page.pdf()` — ce mécanisme se répète nativement sur toutes les pages
3. Utiliser un conteneur `height: companyInfoMm (23mm), overflow: visible` + image en `position: absolute; bottom: 0`

**Résultat visuel** :
- Page 1 : lignes produit (1-9) + footer visible en bas ✅
- Page 2 : lignes produit (10-20) + totaux + footer visible en bas ✅
- Contenu (lignes, totaux) peut survoler la zone décorative du footer ✅
- Bande infos entreprise (23mm bas) toujours visible, jamais cachée ✅

**Fichiers de vérification** : `test_facture_many_lines_page-0001.jpg`, `test_facture_many_lines_page-0002.jpg`

---

### TEST-02 — Header sur toutes les pages ✅ OK
**Date** : 2026-03-18
**Résultat** : Le header (logo BTS + tagline) s'affiche sur les 2 pages. Mécanisme `headerTemplate` Puppeteer.

---

### TEST-03 — Marge basse correcte ✅ OK
**Date** : 2026-03-18
**Valeur** : `marginBottomMm = max(companyInfoMm - bottomWhiteMm, 15) = 23mm`
**Résultat** : Seule la bande infos entreprise est protégée (23mm). La zone décorative haute du footer (~67mm) est dans la zone de contenu — le contenu peut la couvrir avec son fond blanc.

---

### TEST-04 — Variable d'env requise au démarrage ✅ OK
**Date** : 2026-03-18
**Note** : `src/config/env.ts` valide les variables d'env au démarrage (Zod). Pour le script de test (sans vraie DB/Redis), préfixer avec des valeurs fictives (voir commande ci-dessus).

---

## Paramètres clés `src/lib/pdf.ts`

| Constante | Valeur | Rôle |
|---|---|---|
| `footerFullMm` | 90mm | Hauteur totale de l'image footer |
| `companyInfoMm` | 23mm | Hauteur de la bande infos entreprise (bas) |
| `bottomWhiteMm` | 0mm | Blanc sous l'image (si l'image a une bordure basse) |
| `marginBottomMm` | 23mm | Marge basse protégée dans le PDF |
| `headerMm` | ~30mm | Marge haute (hauteur du header BTS) |

---

## À tester (TODO)

- [ ] Proforma multi-page (même vérification footer)
- [ ] Facture type `avoir` (en-tête « AVOIR » au lieu de « FACTURE »)
- [ ] Facture `acompte` + facture `solde` liées
- [ ] PDF sans image footer (cas : entreprise sans assets configurés)
- [ ] PDF sans image header
- [ ] Cachet (seal) : positionnement sur la facture
- [ ] Caractères spéciaux dans les désignations (accents, symboles)
- [ ] Très longue désignation (retour à la ligne automatique dans la cellule)
