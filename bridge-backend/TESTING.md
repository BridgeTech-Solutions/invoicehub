# Guide de test — InvoiceHub v2.0

Ce guide permet de tester toutes les fonctionnalités de l'API manuellement, étape par étape, depuis le démarrage jusqu'aux scénarios métier complets.

> **Outil recommandé** : [Bruno](https://www.usebruno.com/) (gratuit, open-source) ou [Postman](https://www.postman.com/).
> Les exemples utilisent `curl` pour être universels.

---

## 1. DÉMARRAGE ET VÉRIFICATION DE SANTÉ

### Démarrer l'API

```bash
# Démarrage développement
docker-compose up db -d
pnpm install && pnpm prisma:generate && pnpm dev

# OU démarrage Docker complet
docker-compose up -d
```

### Vérifier que l'API répond

```bash
curl http://localhost:3000/health
```

**Réponse attendue :**
```json
{
  "status": "ok",
  "timestamp": "2026-03-05T10:00:00.000Z",
  "env": "development"
}
```

---

## 2. AUTHENTIFICATION

### 2.1 — Créer le premier utilisateur admin (directement en base)

Au premier démarrage, aucun utilisateur n'existe. Il faut en créer un manuellement :

```bash
# Connexion à PostgreSQL
docker exec -it bridge-backend-db-1 psql -U postgres -d invoicehub

# Générer un hash bcrypt pour le mot de passe "Admin1234"
# (hash pré-calculé bcrypt coût 12 pour "Admin1234")
INSERT INTO users (
  first_name, last_name, email, password_hash, role, status, must_change_password
) VALUES (
  'Admin', 'BTS',
  'admin@bts.cm',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY.5TqkzJpPk.bK',
  'admin',
  'active',
  false
);
\q
```

> **Mot de passe** : `Admin1234`

### 2.2 — Connexion (login)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@bts.cm",
    "password": "Admin1234"
  }'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": {
      "id": "uuid...",
      "email": "admin@bts.cm",
      "role": "admin",
      "mustChangePassword": false,
      "twoFactorEnabled": false
    }
  }
}
```

> **Sauvegarder le `accessToken`** — il sera utilisé dans toutes les requêtes suivantes.

```bash
# Dans votre terminal, stocker le token :
TOKEN="eyJhbGci..."
```

### 2.3 — Consulter son profil

```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

### 2.4 — Renouveler les tokens (refresh)

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGci..." }'
```

### 2.5 — Déconnexion (logout)

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGci..." }'
```

### 2.6 — Test d'erreur : mauvais mot de passe

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@bts.cm", "password": "mauvais" }'
```

**Réponse attendue :** `401 UNAUTHORIZED`
```json
{ "success": false, "code": "UNAUTHORIZED", "message": "Email ou mot de passe incorrect" }
```

### 2.7 — Test d'erreur : token absent

```bash
curl http://localhost:3000/api/users/me
```

**Réponse attendue :** `401 UNAUTHORIZED`

### 2.8 — Test d'erreur : token invalide

```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer token_faux"
```

---

## 3. GESTION DES UTILISATEURS

### 3.1 — Créer un utilisateur commercial

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@bts.cm",
    "password": "Commercial1",
    "role": "commercial"
  }'
```

**Réponse attendue :** `201 Created`

### 3.2 — Lister les utilisateurs

```bash
curl "http://localhost:3000/api/users?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### 3.3 — Filtrer par rôle

```bash
curl "http://localhost:3000/api/users?role=commercial" \
  -H "Authorization: Bearer $TOKEN"
```

### 3.4 — Test RBAC : accès refusé

```bash
# Se connecter avec le compte commercial
COMMERCIAL_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jean.dupont@bts.cm","password":"Commercial1"}' \
  | jq -r '.data.accessToken')

# Tenter de lister les utilisateurs (réservé admin)
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer $COMMERCIAL_TOKEN"
```

**Réponse attendue :** `403 FORBIDDEN`

---

## 4. GESTION DES CLIENTS

### 4.1 — Créer un client entreprise

```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "company",
    "name": "Entreprise Test SARL",
    "email": "contact@entreprisetest.cm",
    "phone": "+237 655 000 000",
    "city": "Douala",
    "taxNumber": "M012345678901A",
    "currency": "XAF",
    "defaultPaymentTerms": "30 jours fin de mois"
  }'
```

> **Sauvegarder le champ `id` du client** → `CLIENT_ID`

### 4.2 — Créer un client particulier

```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "individual",
    "name": "Marie Ngo",
    "email": "marie.ngo@gmail.com",
    "phone": "+237 699 111 222",
    "city": "Yaoundé"
  }'
```

### 4.3 — Lister les clients

```bash
curl "http://localhost:3000/api/clients?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.4 — Recherche fulltext

```bash
curl "http://localhost:3000/api/clients?search=Test" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.5 — Résumé financier d'un client

```bash
curl "http://localhost:3000/api/clients/$CLIENT_ID/summary" \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "invoiceCount": 0,
    "totalInvoiced": 0,
    "totalPaid": 0,
    "totalPending": 0,
    "pendingInvoiceCount": 0
  }
}
```

---

## 5. CATALOGUE — CATÉGORIES ET PRODUITS

### 5.1 — Lister les catégories (pré-installées)

```bash
curl http://localhost:3000/api/product-categories \
  -H "Authorization: Bearer $TOKEN"
```

7 catégories BTS sont déjà présentes (Infrastructure, Sécurité, Cloud, etc.)

> **Sauvegarder un `id` de catégorie** → `CATEGORY_ID`

### 5.2 — Créer un produit

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "'$CATEGORY_ID'",
    "name": "Installation réseau LAN",
    "type": "service",
    "unit": "forfait",
    "unitPriceHt": 150000,
    "taxRateValue": 19.25,
    "description": "Installation et configuration réseau local jusqu à 24 postes"
  }'
```

> **Sauvegarder le `id` du produit** → `PRODUCT_ID`

### 5.3 — Créer un deuxième produit

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "'$CATEGORY_ID'",
    "name": "Maintenance mensuelle serveur",
    "type": "service",
    "unit": "mois",
    "unitPriceHt": 75000,
    "taxRateValue": 19.25
  }'
```

### 5.4 — Test d'erreur : produit invalide (prix négatif)

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Test", "unitPriceHt": -100 }'
```

**Réponse attendue :** `400 VALIDATION_ERROR`

---

## 6. SCÉNARIO COMPLET — PROFORMA → FACTURE → PAIEMENT

Ce scénario reproduit le flux commercial type de BTS.

### 6.1 — Créer une proforma (devis)

```bash
curl -X POST http://localhost:3000/api/proformas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "'$CLIENT_ID'",
    "validUntil": "2026-04-05",
    "subject": "Mise en place infrastructure réseau — Siège social",
    "paymentConditions": "50% à la commande, 50% à la livraison",
    "deliveryDelay": "20 JOURS OUVRABLES",
    "warranty": "1 AN PIÈCES ET MAIN D OEUVRE",
    "notes": "Prix valables 30 jours.",
    "globalDiscountType": "none",
    "globalDiscountValue": 0,
    "lines": [
      {
        "productId": "'$PRODUCT_ID'",
        "designation": "Installation réseau LAN (24 postes)",
        "unit": "forfait",
        "quantity": 1,
        "unitPriceHt": 150000,
        "discountType": "none",
        "taxRate": 19.25,
        "sortOrder": 1
      },
      {
        "designation": "Switch 24 ports manageable",
        "unit": "piece",
        "quantity": 2,
        "unitPriceHt": 85000,
        "discountType": "percentage",
        "discountValue": 5,
        "taxRate": 19.25,
        "sortOrder": 2
      }
    ]
  }'
```

**Réponse attendue :** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "...",
    "number": "BTS/DC/2026/03/pfm001",
    "status": "draft",
    "totalTtc": "...",
    "lines": [...]
  }
}
```

> **Sauvegarder le `id` de la proforma** → `PROFORMA_ID`

### 6.2 — Vérifier le détail de la proforma

```bash
curl http://localhost:3000/api/proformas/$PROFORMA_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 6.3 — Envoyer la proforma au client

```bash
curl -X POST "http://localhost:3000/api/proformas/$PROFORMA_ID/send" \
  -H "Authorization: Bearer $TOKEN"
```

**Statut devient :** `sent`

### 6.4 — Test d'erreur : modifier une proforma déjà envoyée

```bash
curl -X PUT "http://localhost:3000/api/proformas/$PROFORMA_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "subject": "Tentative de modification" }'
```

**Réponse attendue :** `400 BAD_REQUEST`

### 6.5 — Accepter la proforma

```bash
curl -X POST "http://localhost:3000/api/proformas/$PROFORMA_ID/accept" \
  -H "Authorization: Bearer $TOKEN"
```

**Statut devient :** `accepted`

### 6.6 — Télécharger le PDF de la proforma

```bash
curl "http://localhost:3000/api/proformas/$PROFORMA_ID/pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o proforma_test.pdf

# Vérifier que le PDF a été créé
ls -lh proforma_test.pdf
```

### 6.7 — Convertir la proforma en facture

```bash
curl -X POST "http://localhost:3000/api/proformas/$PROFORMA_ID/convert" \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue :** `201 Created` — une facture de type `standard` est créée.

> **Sauvegarder le `id` de la facture** → `INVOICE_ID`

### 6.8 — Émettre la facture

```bash
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_ID/issue" \
  -H "Authorization: Bearer $TOKEN"
```

**Statut devient :** `issued`

### 6.9 — Télécharger le PDF de la facture

```bash
curl "http://localhost:3000/api/invoices/$INVOICE_ID/pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o facture_test.pdf
```

### 6.10 — Enregistrer un paiement partiel

```bash
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_ID/payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentDate": "2026-03-10",
    "amount": 150000,
    "method": "virement",
    "reference": "VIR-2026-001",
    "notes": "Acompte 50%"
  }'
```

**Statut facture devient :** `partially_paid`

### 6.11 — Vérifier le solde mis à jour

```bash
curl "http://localhost:3000/api/invoices/$INVOICE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {status, amountPaid, balanceDue}'
```

### 6.12 — Solder la facture (paiement du restant)

```bash
# Remplacer MONTANT par le balance_due retourné à l'étape précédente
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_ID/payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentDate": "2026-03-25",
    "amount": MONTANT,
    "method": "mobile_money",
    "reference": "MOMO-2026-0042"
  }'
```

**Statut facture devient :** `paid`

---

## 7. SCÉNARIO — ANNULATION ET AVOIR AUTOMATIQUE

### 7.1 — Créer et émettre une nouvelle facture

```bash
curl -X POST http://localhost:3000/api/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "standard",
    "clientId": "'$CLIENT_ID'",
    "dueDate": "2026-04-15",
    "subject": "Facture à annuler",
    "lines": [{
      "designation": "Prestation test",
      "quantity": 1,
      "unitPriceHt": 100000,
      "unit": "forfait",
      "taxRate": 19.25
    }]
  }'
```

```bash
# Récupérer l'ID
INVOICE_TO_CANCEL="..."

# Émettre
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_TO_CANCEL/issue" \
  -H "Authorization: Bearer $TOKEN"
```

### 7.2 — Annuler la facture

```bash
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_TO_CANCEL/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Erreur de facturation — doublon" }'
```

**Réponse attendue :**
```json
{
  "success": true,
  "message": "Facture annulée et avoir créé automatiquement"
}
```

### 7.3 — Vérifier que l'avoir a été créé

```bash
curl "http://localhost:3000/api/invoices?type=avoir" \
  -H "Authorization: Bearer $TOKEN"
```

L'avoir doit apparaître avec `type: "avoir"` et `credited_invoice_id` pointant vers la facture annulée.

---

## 8. SCÉNARIO — FACTURATION RÉCURRENTE

### 8.1 — Créer un gabarit de facturation mensuelle

```bash
curl -X POST http://localhost:3000/api/recurring \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "'$CLIENT_ID'",
    "interval": "monthly",
    "nextInvoiceDate": "2026-04-01",
    "subject": "Contrat de maintenance mensuelle",
    "paymentConditions": "30 jours",
    "lines": [{
      "designation": "Maintenance serveur mensuelle",
      "quantity": 1,
      "unitPriceHt": 75000,
      "unit": "mois",
      "taxRate": 19.25,
      "sortOrder": 1
    }]
  }'
```

> **Sauvegarder le `id` du gabarit** → `TEMPLATE_ID`

### 8.2 — Générer manuellement une facture

```bash
curl -X POST "http://localhost:3000/api/recurring/$TEMPLATE_ID/generate" \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue :** `201 Created` — facture de type `recurring` créée.
La `next_invoice_date` du gabarit est automatiquement avancée d'un mois.

### 8.3 — Désactiver le gabarit

```bash
curl -X POST "http://localhost:3000/api/recurring/$TEMPLATE_ID/deactivate" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. DASHBOARD — KPIs

```bash
curl http://localhost:3000/api/dashboard/kpis \
  -H "Authorization: Bearer $TOKEN"
```

**Réponse attendue :** un objet avec `invoices`, `overdue`, `payments`, `pending`, `clients`, `recentInvoices`, `topClients`, `monthlyRevenue`.

---

## 10. NOTIFICATIONS

### Lister les notifications

```bash
curl "http://localhost:3000/api/notifications" \
  -H "Authorization: Bearer $TOKEN"
```

### Lister uniquement les non lues

```bash
curl "http://localhost:3000/api/notifications?unreadOnly=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Tout marquer comme lu

```bash
curl -X PUT "http://localhost:3000/api/notifications/read-all" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 11. TESTS DE SÉCURITÉ

### 11.1 — Rate limiting sur le login (10 tentatives max en 15 min)

```bash
for i in {1..12}; do
  curl -s -o /dev/null -w "Tentative $i : %{http_code}\n" \
    -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@bts.cm","password":"mauvais"}'
done
```

À partir de la 11ème tentative : `429 Too Many Requests`

### 11.2 — Accès sans token

```bash
curl http://localhost:3000/api/invoices
# Attendu : 401
```

### 11.3 — Accès avec token expiré

Attendre 15 minutes après connexion (ou réduire `JWT_ACCESS_EXPIRES_IN=1s` dans `.env` pour tester), puis :

```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
# Attendu : 401 - "Token invalide ou expiré"
```

### 11.4 — Violation de RBAC

```bash
# Créer un compte employee et le connecter
EMPLOYEE_TOKEN="..."

# Tenter de supprimer un utilisateur (admin seulement)
curl -X DELETE http://localhost:3000/api/users/some-id \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN"
# Attendu : 403 FORBIDDEN
```

### 11.5 — Tentative de surpaiement

```bash
# Tenter de payer plus que le solde dû
curl -X POST "http://localhost:3000/api/invoices/$INVOICE_ID/payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 99999999, "method": "virement" }'
# Attendu : 400 - "Le paiement dépasse le solde dû"
```

---

## 12. VÉRIFICATION DE LA BASE DE DONNÉES

### Accéder à Prisma Studio (interface graphique)

```bash
pnpm prisma:studio
```

Ouvre **http://localhost:5555** — interface web pour parcourir et modifier les données directement.

### Vérifier les audit_logs

```bash
docker exec -it bridge-backend-db-1 psql -U postgres -d invoicehub \
  -c "SELECT action, table_name, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

### Vérifier la numérotation SYSCOHADA

```bash
docker exec -it bridge-backend-db-1 psql -U postgres -d invoicehub \
  -c "SELECT office_id, document_type, year, month, last_sequence FROM document_sequences;"
```

---

## 13. CODES D'ERREUR DE RÉFÉRENCE

| Code HTTP | Code JSON | Cause |
|---|---|---|
| `400` | `BAD_REQUEST` | Règle métier violée |
| `400` | `VALIDATION_ERROR` | Données invalides (Zod) |
| `401` | `UNAUTHORIZED` | Token absent, invalide ou expiré |
| `401` | `TOTP_REQUIRED` | Code 2FA attendu |
| `403` | `FORBIDDEN` | Rôle insuffisant |
| `404` | `NOT_FOUND` | Ressource introuvable |
| `409` | `CONFLICT` | Conflit (doublon, FK) |
| `429` | `RATE_LIMIT` | Trop de requêtes |
| `500` | `INTERNAL_ERROR` | Erreur serveur (voir les logs) |

---

## 14. LOGS EN TEMPS RÉEL

```bash
# Logs de l'API (développement)
# Les logs s'affichent directement dans le terminal lors de `pnpm dev`

# Logs Docker (production)
docker-compose logs -f api

# Logs PostgreSQL
docker-compose logs -f db
```

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
