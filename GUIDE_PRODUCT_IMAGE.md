# Guide d'implémentation — Images produits sur lignes proforma/facture

## Vue d'ensemble

Permettre d'associer une image (photo, icône) à chaque produit/service. Cette image s'affiche :
- Dans la fiche produit (upload/preview/suppression)
- Dans la liste des produits (colonne miniature)
- Dans le dropdown de sélection de produit sur les formulaires de ligne
- À gauche de la désignation sur chaque ligne de proforma/facture (UI + PDF)

**Choix de design** : pas de snapshot de l'image sur les lignes — l'image est cosmétique (contrairement au prix), elle est lue via `productId` au moment du rendu.

---

## Étape 1 — Base de données

### 1.1 `invoicehub_schema_v2.sql` (schéma racine)

Ajouter la colonne `image_path` à la table `products` :

```sql
-- Dans la définition de la table products, après description
image_path VARCHAR(500) NULL,
```

### 1.2 `bridge-backend/prisma/schema.prisma`

Ajouter le champ au modèle `Product` :

```prisma
model Product {
  // ... champs existants ...
  imagePath   String?  @map("image_path") @db.VarChar(500)
  // ...
}
```

### 1.3 Migration en production

Puisque le projet n'utilise pas `prisma migrate` (schéma géré manuellement) :

```sql
-- À exécuter manuellement sur la DB de prod
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_path VARCHAR(500) NULL;
```

### 1.4 Régénérer le client Prisma

```bash
pnpm prisma generate
```

---

## Étape 2 — Backend : upload et suppression

### 2.1 Nouvelle route dans `products.routes.ts`

Ajouter deux endpoints après les routes existantes :

```
POST   /api/products/:id/image   — upload image (admin, commercial)
DELETE /api/products/:id/image   — supprime image (admin, commercial)
```

**Contraintes Multer :**
- Taille max : 2 MB
- Types acceptés : `image/jpeg`, `image/png`, `image/webp`
- Destination : `uploads/products/`
- Nom fichier : `{productId}.{ext}` (écrase l'ancienne image automatiquement)

### 2.2 Logique dans `products.service.ts`

**`uploadImage(productId, file)`**
1. Vérifier que le produit existe (`findFirst`)
2. Si `imagePath` existant → supprimer l'ancien fichier (`fs.unlink`)
3. Mettre à jour `imagePath` dans la DB : `uploads/products/{productId}.{ext}`
4. Retourner le produit mis à jour

**`deleteImage(productId)`**
1. Vérifier que le produit existe et a une image
2. Supprimer le fichier physique
3. Mettre `imagePath: null` en DB

### 2.3 Exposer l'image via `express.static`

Les images sont déjà servies automatiquement par le middleware existant dans `app.ts` :

```typescript
app.use('/uploads', express.static('uploads'))
```

Aucune modification nécessaire — `GET /uploads/products/{productId}.jpg` fonctionne directement.

### 2.4 Adapter `products.service.ts` — méthode `list` et `findById`

S'assurer que `imagePath` est inclus dans les `select` des requêtes existantes (probablement déjà le cas si `select` non restreint).

### 2.5 Audit

Ajouter `auditMiddleware('product', 'UPDATE')` sur les deux nouvelles routes.

---

## Étape 3 — Frontend : fiche produit

### 3.1 Composant `ProductImageUpload`

Créer `src/features/products/components/ProductImageUpload.tsx` :

**États :**
- Pas d'image : zone de drop avec icône + bouton "Ajouter une image"
- Image existante : aperçu `80×80px` + bouton "Changer" + bouton "Supprimer"
- En cours d'upload : spinner sur la zone

**Comportement :**
- Clic ou drag & drop → sélecteur de fichier
- Validation client : type (jpg/png/webp) + taille (≤ 2 MB) avant envoi
- Upload immédiat à la sélection (pas besoin de sauvegarder le formulaire)
- Suppression avec confirmation simple (pas de modale — juste `window.confirm`)

**Props :**
```typescript
{
  productId: string
  imagePath: string | null
  onUpdate: (newImagePath: string | null) => void
}
```

### 3.2 Intégration dans la page produit

Dans la page de création/édition produit, ajouter `ProductImageUpload` dans le formulaire, dans une section dédiée sous les champs principaux.

À la création : le produit doit être créé d'abord (pour avoir un `id`), puis l'image uploadée dans un second temps. Gérer ce cas dans le flux :
1. `POST /products` → obtenir l'`id`
2. Si image sélectionnée → `POST /products/:id/image`

### 3.3 Hooks TanStack Query

Dans `src/features/products/hooks.ts`, ajouter :

```typescript
useUploadProductImage(productId)   // mutation POST
useDeleteProductImage(productId)   // mutation DELETE
// Les deux invalident ['products'] et ['product', productId]
```

---

## Étape 4 — Frontend : liste des produits

### 4.1 Colonne miniature dans le tableau

Dans la liste des produits, ajouter une colonne "Image" en première position :

```
| Image | Référence | Désignation | Catégorie | Prix HT | ... |
```

**Rendu de la cellule :**
```typescript
// Avec image
<img
  src={`${BASE_MEDIA_URL}/${product.imagePath}`}
  alt={product.name}
  style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }}
/>

// Sans image
<div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  <Package size={16} color="var(--text-3)" />
</div>
```

---

## Étape 5 — Frontend : formulaire de ligne (proforma/facture)

C'est l'affichage principal — la miniature à gauche de la désignation dans chaque ligne.

### 5.1 Dropdown de sélection de produit

Quand l'utilisateur choisit un produit dans le select d'une ligne, afficher l'image dans l'option :

```
[ 🖼 40×40 ] Nom du produit — Ref: XXX
```

Structure de l'option :
```typescript
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  <ProductThumb imagePath={product.imagePath} size={36} />
  <div>
    <div style={{ fontWeight: 600 }}>{product.name}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{product.reference}</div>
  </div>
</div>
```

### 5.2 Ligne du tableau après sélection

Dans le tableau des lignes (composant `LineItemsTable` ou équivalent), afficher la miniature dans la colonne "Désignation" :

```
| # | [img] Désignation       | Qté | U | P.U HT | ... |
|---|-------------------------|-----|---|--------|-----|
| 1 | [🖼] Ordinateur Dell     |  2  | U | 450 000|     |
| 2 | [  ] Maintenance annuelle|  1  | F | 120 000|     |
```

**Dimensions fixes dans le tableau :**
- Image : `40×40px`, `object-fit: cover`, `border-radius: 4px`
- Espace réservé (sans image) : `40×40px` vide — pour que toutes les lignes aient la même hauteur

**Composant réutilisable `ProductThumb` :**
```typescript
// src/features/products/components/ProductThumb.tsx
function ProductThumb({ imagePath, size = 40 }: { imagePath?: string | null; size?: number }) {
  if (!imagePath) {
    return <div style={{ width: size, height: size, borderRadius: 4,
      background: 'var(--surface)', border: '1px solid var(--border)',
      flexShrink: 0 }} />
  }
  return (
    <img
      src={`${BASE_MEDIA_URL}/${imagePath}`}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, objectFit: 'cover',
        borderRadius: 4, flexShrink: 0, display: 'block' }}
    />
  )
}
```

### 5.3 Récupérer `imagePath` avec les données produit

Lors du chargement de la liste des produits pour le formulaire de ligne, s'assurer que `imagePath` est inclus dans la réponse de `GET /products`. Si le select existant fait une requête séparée, vérifier que le champ est présent.

---

## Étape 6 — PDF

C'est la partie la plus technique. Le générateur PDF actuel dessine les lignes du tableau avec PDFKit.

### 6.1 Logique générale

Pour chaque ligne du tableau :
1. Si `product.imagePath` est défini → lire le fichier avec `fs.existsSync` + `fs.readFileSync`
2. Dessiner l'image avec `doc.image(buffer, x, y, { width: 28, height: 28, cover: [28, 28] })`
3. Décaler le texte "Désignation" de `28 + 6 = 34pt` vers la droite
4. Si pas d'image → texte "Désignation" à sa position habituelle (pas d'espace réservé dans le PDF pour ne pas gâcher l'espace)

**Alternative plus simple** : si **au moins une ligne** de la proforma a une image → activer la colonne image sur toutes les lignes (espace réservé pour les lignes sans). Sinon → aucune colonne image, layout identique à aujourd'hui.

### 6.2 Hauteur de ligne

Ligne standard actuelle : ~20pt de hauteur.
Avec image 28×28pt : passer à **32pt minimum** pour les lignes avec image.

Si on adopte l'alternative "colonne activée pour toute la proforma", toutes les lignes passent à 32pt quand au moins une image est présente.

### 6.3 Gestion des erreurs

```typescript
function loadProductImage(imagePath: string): Buffer | null {
  try {
    const fullPath = path.join(process.cwd(), imagePath)
    if (!fs.existsSync(fullPath)) return null
    return fs.readFileSync(fullPath)
  } catch {
    return null  // Image manquante → on continue sans image, pas d'erreur PDF
  }
}
```

### 6.4 Fichiers à modifier

- `src/lib/pdf.ts` (ou `pdf.service.ts`) — fonction de rendu du tableau de lignes
- Chercher la boucle qui itère sur `lines` pour dessiner chaque ligne
- Modifier uniquement le rendu de la colonne "Désignation"

---

## Étape 7 — Tests manuels

### Scénarios à vérifier

| Scénario | Attendu |
|---|---|
| Upload jpg valide | Image affichée dans fiche + liste |
| Upload > 2 MB | Erreur 400 côté client avant envoi |
| Upload type invalide (pdf, svg) | Rejeté par Multer |
| Produit sans image dans formulaire ligne | Espace vide `40×40` cohérent |
| Produit avec image dans formulaire ligne | Miniature visible |
| PDF proforma avec images | Image 28×28pt bien alignée avec texte |
| PDF proforma sans aucune image | Layout identique à aujourd'hui |
| PDF proforma lignes mixtes (avec et sans) | Espaces réservés cohérents |
| Suppression image → PDF existant | PDF regénéré sans image (lecture à la volée) |
| Fichier image supprimé du disque | PDF généré sans planter (fallback `null`) |

---

## Récapitulatif des fichiers à créer/modifier

### Backend
| Fichier | Action |
|---|---|
| `invoicehub_schema_v2.sql` | Ajouter `image_path` à `products` |
| `prisma/schema.prisma` | Ajouter `imagePath` au modèle `Product` |
| `modules/products/products.routes.ts` | 2 nouvelles routes image |
| `modules/products/products.service.ts` | `uploadImage()` + `deleteImage()` |
| `src/lib/pdf.ts` | Modifier rendu colonne Désignation |

### Frontend
| Fichier | Action |
|---|---|
| `features/products/components/ProductThumb.tsx` | Nouveau composant réutilisable |
| `features/products/components/ProductImageUpload.tsx` | Nouveau composant upload |
| `features/products/hooks.ts` | 2 nouvelles mutations |
| `features/products/api.ts` | 2 nouveaux appels API |
| Page création/édition produit | Intégrer `ProductImageUpload` |
| Page liste produits | Colonne miniature |
| Composant formulaire ligne proforma/facture | `ProductThumb` dans dropdown + tableau |

---

## Ordre d'implémentation recommandé

```
1. SQL + Prisma schema + prisma generate          (5 min)
2. Backend : routes + service upload/delete       (30 min)
3. Frontend : ProductThumb + hooks/api            (20 min)
4. Frontend : fiche produit (upload UI)           (30 min)
5. Frontend : liste produits (colonne)            (15 min)
6. Frontend : formulaire ligne (dropdown + row)   (45 min)
7. PDF : modifier rendu tableau                   (60 min)
8. Tests manuels                                  (30 min)
```
