# Guide de test Postman — InvoiceHub v2.0

## Configuration initiale

### 1. Environnement Postman

Créer un environnement **InvoiceHub Dev** avec les variables suivantes :

| Variable | Initial Value | Remarque |
|---|---|---|
| `base_url` | `http://localhost:3000/api` | |
| `access_token` | _(vide)_ | Rempli automatiquement |
| `refresh_token` | _(vide)_ | Rempli automatiquement |
| `user_id` | _(vide)_ | Rempli automatiquement |
| `client_id` | _(vide)_ | Rempli au fil des tests |
| `invoice_id` | _(vide)_ | Rempli au fil des tests |
| `proforma_id` | _(vide)_ | Rempli au fil des tests |
| `product_id` | _(vide)_ | Rempli au fil des tests |
| `category_id` | _(vide)_ | Rempli au fil des tests |

### 2. Script Pre-request global (Collection)

Coller dans **Pre-request Script** de la collection racine pour rafraichir automatiquement le token :

```javascript
const accessToken = pm.environment.get('access_token');
const refreshToken = pm.environment.get('refresh_token');

if (!accessToken || !refreshToken) return;

// Décoder le JWT pour vérifier l'expiration
const payload = JSON.parse(atob(accessToken.split('.')[1]));
const expiresIn = payload.exp * 1000 - Date.now();

if (expiresIn > 60000) return; // Encore valide > 1 min

pm.sendRequest({
  url: pm.environment.get('base_url') + '/auth/refresh',
  method: 'POST',
  header: { 'Content-Type': 'application/json' },
  body: {
    mode: 'raw',
    raw: JSON.stringify({ refreshToken })
  }
}, (err, res) => {
  if (!err && res.code === 200) {
    const data = res.json().data;
    pm.environment.set('access_token', data.accessToken);
    pm.environment.set('refresh_token', data.refreshToken);
  }
});
```

### 3. Header Authorization global

Dans l'onglet **Authorization** de la collection racine :
- Type : `Bearer Token`
- Token : `{{access_token}}`

---

## Module 1 — Authentification (`/api/auth`)

### 1.1 Login

**POST** `{{base_url}}/auth/login`

```json
{
  "email": "admin@bts.cm",
  "password": "Admin1234!"
}
```

**Tests** (onglet Tests) :
```javascript
pm.test("Login OK", () => pm.response.to.have.status(200));
const data = pm.response.json().data;
pm.environment.set('access_token', data.accessToken);
pm.environment.set('refresh_token', data.refreshToken);
pm.environment.set('user_id', data.user.id);
```

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "admin@bts.cm",
      "role": "admin",
      "twoFactorEnabled": false
    }
  }
}
```

---

### 1.2 Refresh Token

**POST** `{{base_url}}/auth/refresh`

```json
{
  "refreshToken": "{{refresh_token}}"
}
```

**Tests** :
```javascript
pm.test("Refresh OK", () => pm.response.to.have.status(200));
const data = pm.response.json().data;
pm.environment.set('access_token', data.accessToken);
pm.environment.set('refresh_token', data.refreshToken);
```

---

### 1.3 Logout

**POST** `{{base_url}}/auth/logout`

```json
{
  "refreshToken": "{{refresh_token}}"
}
```

**Reponse attendue** : `{ "success": true, "message": "Deconnecte avec succes" }`

---

### 1.4 Activer le 2FA (TOTP)

**POST** `{{base_url}}/auth/2fa/enable`
_(Authentifie)_

Corps : aucun

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "secret": "BASE32SECRET",
    "qrCodeUrl": "data:image/png;base64,..."
  }
}
```

> Scanner le QR code avec Google Authenticator ou Authy.

---

### 1.5 Verifier et activer le 2FA

**POST** `{{base_url}}/auth/2fa/verify`

```json
{
  "totpToken": "123456"
}
```

**Reponse attendue** :
```json
{
  "success": true,
  "message": "2FA active. Conservez precieusement vos codes de secours.",
  "data": {
    "backupCodes": ["A1B2C3D4", "E5F6G7H8", "C3D4E5F6", "G7H8I9J0", "K1L2M3N4", "O5P6Q7R8", "S9T0U1V2", "W3X4Y5Z6"]
  }
}
```

> **Important** : sauvegarder les 8 codes de secours. Ils ne sont affiches qu'une seule fois.

---

### 1.6 Login avec 2FA actif

**POST** `{{base_url}}/auth/login`

```json
{
  "email": "admin@bts.cm",
  "password": "Admin1234!",
  "totpToken": "123456"
}
```

> Si le TOTP echoue, utiliser un code de secours dans le champ `totpToken` (ex: `"A1B2C3D4"`).

---

### 1.7 Regenerer les codes de secours

**POST** `{{base_url}}/auth/2fa/backup-codes`

```json
{
  "totpToken": "123456"
}
```

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "backupCodes": ["NEW1CODE", "NEW2CODE", "..."]
  }
}
```

> Les anciens codes sont invalides immediatement.

---

### 1.8 Desactiver le 2FA

**POST** `{{base_url}}/auth/2fa/disable`

```json
{
  "totpToken": "123456"
}
```

---

### 1.9 Mot de passe oublie

**POST** `{{base_url}}/auth/forgot-password`

```json
{
  "email": "admin@bts.cm"
}
```

> Toujours 200 meme si l'email n'existe pas (securite anti-enumeration).

---

### 1.10 Reinitialiser le mot de passe

**POST** `{{base_url}}/auth/reset-password`

```json
{
  "token": "TOKEN_RECU_PAR_EMAIL",
  "password": "NouveauMdp1!",
  "confirmPassword": "NouveauMdp1!"
}
```

---

### 1.11 Sessions actives

**GET** `{{base_url}}/auth/sessions`

**Reponse attendue** :
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "deviceName": "Chrome / Windows 10",
      "ipAddress": "41.202.xxx.xxx",
      "createdAt": "2026-03-01T08:00:00Z",
      "current": true
    }
  ]
}
```

---

### 1.12 Revoquer une session

**DELETE** `{{base_url}}/auth/sessions/SESSION_ID`

---

### 1.13 Revoquer toutes les sessions

**DELETE** `{{base_url}}/auth/sessions`

---

## Module 2 — Utilisateurs (`/api/users`)

### 2.1 Profil courant

**GET** `{{base_url}}/users/me`

**Tests** :
```javascript
pm.test("Profil OK", () => {
  pm.response.to.have.status(200);
  pm.expect(pm.response.json().data).to.have.property('email');
});
```

---

### 2.2 Mettre a jour son profil

**PUT** `{{base_url}}/users/me`

```json
{
  "firstName": "Jean",
  "lastName": "Dupont",
  "phone": "+237 6XX XX XX XX",
  "language": "fr",
  "theme": "dark"
}
```

---

### 2.3 Changer de mot de passe

**PUT** `{{base_url}}/users/me/password`

```json
{
  "currentPassword": "Admin1234!",
  "newPassword": "Admin5678!",
  "confirmPassword": "Admin5678!"
}
```

---

### 2.4 Lister les utilisateurs (admin)

**GET** `{{base_url}}/users?page=1&limit=10&role=commercial`

Parametres optionnels : `search`, `role`, `status`, `page`, `limit`

---

### 2.5 Creer un utilisateur (admin)

**POST** `{{base_url}}/users`

```json
{
  "email": "commercial1@bts.cm",
  "firstName": "Alice",
  "lastName": "Martin",
  "role": "commercial",
  "password": "Temp1234!"
}
```

**Tests** :
```javascript
pm.test("Cree 201", () => pm.response.to.have.status(201));
pm.environment.set('commercial_id', pm.response.json().data.id);
```

---

### 2.6 Modifier un utilisateur

**PUT** `{{base_url}}/users/{{commercial_id}}`

```json
{
  "firstName": "Alice",
  "lastName": "Dupont",
  "role": "commercial"
}
```

---

### 2.7 Supprimer (soft-delete)

**DELETE** `{{base_url}}/users/{{commercial_id}}`

**Reponse** : `{ "success": true, "message": "Utilisateur archive" }`

---

## Module 3 — Clients (`/api/clients`)

### 3.1 Creer un client

**POST** `{{base_url}}/clients`

```json
{
  "name": "Camtel SA",
  "email": "contact@camtel.cm",
  "phone": "+237 2XX XX XX XX",
  "type": "company",
  "address": "BP 1571, Akwa",
  "city": "Douala",
  "country": "Cameroun",
  "taxNumber": "M123456789A",
  "rccm": "RC/DLA/2020/B/12345",
  "paymentTermsDays": 30
}
```

**Tests** :
```javascript
pm.test("Cree 201", () => pm.response.to.have.status(201));
pm.environment.set('client_id', pm.response.json().data.id);
```

---

### 3.2 Lister les clients

**GET** `{{base_url}}/clients?page=1&limit=10&search=camtel`

---

### 3.3 Detail d'un client

**GET** `{{base_url}}/clients/{{client_id}}`

---

### 3.4 Resume financier

**GET** `{{base_url}}/clients/{{client_id}}/summary`

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "totalInvoiced": 5000000,
    "totalPaid": 3500000,
    "totalPending": 1500000,
    "invoiceCount": 8,
    "overdueCount": 2
  }
}
```

---

### 3.5 Quick-fill (pre-remplissage formulaire)

**GET** `{{base_url}}/clients/{{client_id}}/quick-fill`

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "lastPaymentTermsDays": 30,
    "lastDiscount": 5,
    "unpaidBalance": 1500000,
    "unpaidInvoiceCount": 2,
    "paymentBehavior": {
      "avgDaysLate": 3.5,
      "onTimeRate": 0.85,
      "totalInvoices": 8
    },
    "topProducts": [
      {
        "productId": "uuid",
        "productName": "Consultation IT",
        "usageCount": 5,
        "lastUnitPrice": 250000
      }
    ]
  }
}
```

> Utiliser en debut de formulaire pour pre-remplir les conditions et suggerer les produits habituels.

---

## Module 4 — Produits (`/api/products`)

### 4.1 Creer une categorie

**POST** `{{base_url}}/product-categories`

```json
{
  "name": "Services IT",
  "description": "Prestations informatiques et conseil"
}
```

**Tests** :
```javascript
pm.environment.set('category_id', pm.response.json().data.id);
```

---

### 4.2 Creer un produit

**POST** `{{base_url}}/products`

```json
{
  "name": "Maintenance reseau",
  "reference": "SRV-MNT-001",
  "description": "Maintenance preventive et curative reseau LAN/WAN",
  "type": "service",
  "unit": "forfait",
  "unitPriceHt": 350000,
  "categoryId": "{{category_id}}"
}
```

**Tests** :
```javascript
pm.test("Cree 201", () => pm.response.to.have.status(201));
pm.environment.set('product_id', pm.response.json().data.id);
```

---

### 4.3 Lister les produits avec annotation client

**GET** `{{base_url}}/products?clientId={{client_id}}&search=maintenance`

> Retourne les produits annotes avec `usageCount` et `lastPriceForClient`, tries par frequence d'utilisation pour ce client.

---

### 4.4 Defauts de ligne (line-defaults)

**GET** `{{base_url}}/products/{{product_id}}/line-defaults?clientId={{client_id}}`

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "designation": "Maintenance reseau",
    "description": "Maintenance preventive et curative reseau LAN/WAN",
    "unit": "forfait",
    "unitPriceHt": 350000,
    "taxRate": 19.25,
    "catalogPrice": 350000,
    "lastPriceForClient": 320000,
    "lastQuantityForClient": 1,
    "defaultQuantity": 1,
    "priceChangedSinceLastInvoice": true
  }
}
```

> Appeler lors de la selection d'un produit dans une ligne de facture. Si `priceChangedSinceLastInvoice = true`, afficher un indicateur a l'utilisateur.

---

## Module 5 — Proformas (`/api/proformas`)

### 5.1 Creer un proforma

**POST** `{{base_url}}/proformas`

```json
{
  "clientId": "{{client_id}}",
  "subject": "Mise en place infrastructure reseau",
  "validityDays": 30,
  "discount": 5,
  "notes": "Conditions de paiement : 30 jours fin de mois",
  "lines": [
    {
      "productId": "{{product_id}}",
      "designation": "Maintenance reseau",
      "description": "Maintenance preventive mensuelle",
      "quantity": 3,
      "unitPriceHt": 350000,
      "unit": "forfait",
      "taxRate": 19.25
    },
    {
      "designation": "Deplacement technicien",
      "quantity": 6,
      "unitPriceHt": 25000,
      "unit": "deplacement",
      "taxRate": 19.25
    }
  ]
}
```

**Tests** :
```javascript
pm.test("Cree 201", () => pm.response.to.have.status(201));
const data = pm.response.json().data;
pm.environment.set('proforma_id', data.id);
pm.test("Numero SYSCOHADA", () => pm.expect(data.number).to.match(/^BTS\//));
```

---

### 5.2 Envoyer le proforma au client

**POST** `{{base_url}}/proformas/{{proforma_id}}/send`

Corps : aucun

> Statut : `draft` -> `sent`. Email envoye au client avec PDF en piece jointe.

---

### 5.3 Accepter le proforma

**POST** `{{base_url}}/proformas/{{proforma_id}}/accept`

Corps : aucun

---

### 5.4 Rejeter le proforma

**POST** `{{base_url}}/proformas/{{proforma_id}}/reject`

```json
{
  "reason": "Budget insuffisant pour cette periode"
}
```

---

### 5.5 Convertir en facture

**POST** `{{base_url}}/proformas/{{proforma_id}}/convert`

```json
{
  "invoiceType": "standard"
}
```

Ou pour une facture acompte (30%) :
```json
{
  "invoiceType": "acompte",
  "depositPercent": 30
}
```

**Tests** :
```javascript
pm.test("Converti 201", () => pm.response.to.have.status(201));
pm.environment.set('invoice_id', pm.response.json().data.id);
```

---

### 5.6 Dupliquer un proforma

**POST** `{{base_url}}/proformas/{{proforma_id}}/duplicate`

---

### 5.7 Telecharger le PDF

**GET** `{{base_url}}/proformas/{{proforma_id}}/pdf`

> Dans Postman : onglet **Send and Download** pour enregistrer le fichier.

---

## Module 6 — Factures (`/api/invoices`)

### 6.1 Calcul a sec (dry-run)

**POST** `{{base_url}}/invoices/compute`

```json
{
  "clientId": "{{client_id}}",
  "discount": 5,
  "lines": [
    {
      "quantity": 2,
      "unitPriceHt": 350000,
      "taxRate": 19.25,
      "discount": 0
    }
  ]
}
```

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "totals": {
      "totalHt": 700000,
      "totalTax": 134750,
      "totalTtc": 834750,
      "discountAmount": 41738,
      "netTtc": 793012
    },
    "lines": [
      { "totalHt": 700000, "taxAmount": 134750, "totalTtc": 834750 }
    ],
    "warnings": [
      {
        "type": "UNPAID_BALANCE",
        "message": "Ce client a 1 500 000 XAF de solde impayes",
        "severity": "warning"
      }
    ],
    "hasErrors": false,
    "hasWarnings": true
  }
}
```

Types d'avertissements possibles :
- `UNPAID_BALANCE` — client avec factures impayees
- `UNUSUAL_AMOUNT` — montant anormal par rapport a l'historique
- `DUPLICATE_RISK` — facture similaire recente pour ce client
- `DUPLICATE_CLIENT_REFERENCE` — reference client deja utilisee

---

### 6.2 Creer une facture

**POST** `{{base_url}}/invoices`

```json
{
  "clientId": "{{client_id}}",
  "type": "standard",
  "subject": "Prestation maintenance Q1 2026",
  "issueDate": "2026-03-01",
  "dueDate": "2026-03-31",
  "discount": 0,
  "lines": [
    {
      "productId": "{{product_id}}",
      "designation": "Maintenance reseau",
      "quantity": 1,
      "unitPriceHt": 350000,
      "unit": "forfait",
      "taxRate": 19.25
    }
  ]
}
```

**Tests** :
```javascript
pm.test("Cree 201", () => pm.response.to.have.status(201));
pm.environment.set('invoice_id', pm.response.json().data.id);
```

---

### 6.3 Lister les factures

**GET** `{{base_url}}/invoices?status=issued&type=standard&page=1&limit=10`

Parametres : `status`, `type`, `clientId`, `search`, `dateFrom`, `dateTo`, `page`, `limit`

---

### 6.4 Exporter en CSV

**GET** `{{base_url}}/invoices?export=csv`

> Retourne un fichier `factures.csv` avec BOM UTF-8.

---

### 6.5 Emettre la facture

**POST** `{{base_url}}/invoices/{{invoice_id}}/issue`

Corps : aucun

> Statut : `draft` -> `issued`. Numero SYSCOHADA assigne definitivement.

---

### 6.6 Dupliquer une facture

**POST** `{{base_url}}/invoices/{{invoice_id}}/duplicate`

---

### 6.7 Annuler et generer l'avoir automatique

**POST** `{{base_url}}/invoices/{{invoice_id}}/cancel`
_(Role : admin ou commercial)_

```json
{
  "reason": "Erreur de saisie - prix incorrect"
}
```

**Reponse attendue** :
```json
{
  "success": true,
  "message": "Facture annulee et avoir cree automatiquement",
  "data": {
    "cancelledInvoice": { "id": "...", "status": "cancelled" },
    "creditNote": {
      "id": "...",
      "number": "BTS/DC/2026/03/AV001",
      "type": "avoir"
    }
  }
}
```

---

### 6.8 Telecharger le PDF

**GET** `{{base_url}}/invoices/{{invoice_id}}/pdf`

> Rate-limit : 10 requetes/minute par utilisateur.

---

## Module 7 — Paiements (`/api/invoices/:id/payment` et `/api/payments`)

### 7.1 Enregistrer un paiement

**POST** `{{base_url}}/invoices/{{invoice_id}}/payment`

```json
{
  "amount": 200000,
  "method": "bank_transfer",
  "reference": "VIR-2026-0312",
  "paidAt": "2026-03-12",
  "notes": "Virement recu compte BTS Douala"
}
```

Methodes valides : `cash`, `bank_transfer`, `check`, `mobile_money`, `other`

**Tests** :
```javascript
pm.test("Paiement 201", () => pm.response.to.have.status(201));
const invoice = pm.response.json().data.invoice;
pm.test("Statut mis a jour", () => {
  pm.expect(['partially_paid', 'paid']).to.include(invoice.status);
});
pm.test("Solde recalcule", () => {
  pm.expect(invoice.balanceDue).to.be.lessThan(invoice.totalTtc);
});
```

---

### 7.2 Lister les paiements

**GET** `{{base_url}}/payments?page=1&limit=20`

Parametres : `invoiceId`, `method`, `dateFrom`, `dateTo`

---

### 7.3 Supprimer un paiement (admin)

**DELETE** `{{base_url}}/payments/PAYMENT_ID`

> Soft-delete. Recalcule le solde et le statut de la facture.

---

## Module 8 — Notifications (`/api/notifications`)

### 8.1 Lister les notifications

**GET** `{{base_url}}/notifications?unreadOnly=true&page=1&limit=20`

---

### 8.2 Marquer une notification comme lue

**PUT** `{{base_url}}/notifications/NOTIF_ID/read`

---

### 8.3 Marquer tout comme lu

**PUT** `{{base_url}}/notifications/read-all`

---

### 8.4 Lire les preferences de notification

**GET** `{{base_url}}/notifications/settings`

---

### 8.5 Mettre a jour les preferences

**PUT** `{{base_url}}/notifications/settings`

```json
{
  "settings": [
    { "type": "invoice_issued",           "channel": "both",   "enabled": true  },
    { "type": "invoice_paid",             "channel": "email",  "enabled": true  },
    { "type": "invoice_overdue",          "channel": "both",   "enabled": true  },
    { "type": "proforma_sent",            "channel": "in_app", "enabled": true  },
    { "type": "payment_registered",       "channel": "both",   "enabled": true  },
    { "type": "system",                   "channel": "in_app", "enabled": false }
  ]
}
```

Types disponibles : `proforma_sent`, `proforma_accepted`, `proforma_rejected`, `proforma_expired`, `invoice_issued`, `invoice_paid`, `invoice_partially_paid`, `invoice_overdue`, `payment_registered`, `payment_reminder`, `system`

---

## Module 9 — Dashboard (`/api/dashboard`)

### 9.1 KPIs principaux

**GET** `{{base_url}}/dashboard/kpis`

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "revenue": {
      "currentMonth": 4500000,
      "previousMonth": 3800000,
      "growth": 18.4
    },
    "invoices": {
      "total": 42,
      "draft": 3,
      "issued": 12,
      "paid": 24,
      "overdue": 3,
      "cancelled": 0
    },
    "topClients": [
      { "id": "...", "name": "Camtel SA", "totalTtc": 12500000 }
    ],
    "revenueByMonth": [
      { "month": "2026-01", "totalHt": 3200000, "totalTtc": 3816000 }
    ]
  }
}
```

> Resultat mis en cache Redis 5 minutes. Invalide automatiquement apres chaque paiement ou emission.

---

## Module 10 — Recherche intelligente (`/api/search`)

### 10.1 Recherche simple par nom

**GET** `{{base_url}}/search?q=Camtel`

---

### 10.2 Navigation directe par numero de document

**GET** `{{base_url}}/search?q=FAC-031`

**Reponse** : contient `navigation: { type: "invoice", id: "uuid", number: "BTS/DC/2026/03/FAC031" }`

---

### 10.3 Filtre par montant

**GET** `{{base_url}}/search?q=impayes > 500000`

**GET** `{{base_url}}/search?q=>= 1M envoye`

---

### 10.4 Filtre par periode

**GET** `{{base_url}}/search?q=Camtel mars 2026`

**GET** `{{base_url}}/search?q=brouillon janvier 2026`

---

### 10.5 Requete combinee

**GET** `{{base_url}}/search?q=brouillon >= 1M janvier 2026&limit=10`

**Reponse attendue** :
```json
{
  "success": true,
  "data": {
    "parsed": {
      "description": "Proformas/Factures brouillon, montant >= 1 000 000 XAF, janvier 2026",
      "invoiceStatuses": ["draft"],
      "proformaStatuses": ["draft"],
      "amountGte": 1000000,
      "year": 2026,
      "month": 1
    },
    "navigation": null,
    "results": {
      "invoices": [...],
      "proformas": [...],
      "clients": [],
      "products": [],
      "users": []
    },
    "total": 4
  }
}
```

### Mots-cles reconnus

| Mot-cle | Filtre applique |
|---|---|
| `impayes`, `en retard`, `overdue` | invoiceStatuses: overdue |
| `brouillon`, `draft` | statuts draft |
| `envoye`, `emis`, `issued` | statuts issued/sent |
| `paye`, `paid`, `accepte` | statuts paid/accepted |
| `annule`, `cancelled` | statuts cancelled |
| `>500000`, `>500K`, `>=1M` | filtre montant |
| `janvier`...`decembre` | filtre mois |
| `2025`, `2026` | filtre annee |
| `FAC-031`, `BTS/DC/...` | navigation directe |

---

## Module 11 — Parametres (`/api/settings`)

### 11.1 Lire la configuration

**GET** `{{base_url}}/settings`

---

### 11.2 Mettre a jour les parametres (admin)

**PUT** `{{base_url}}/settings`

```json
{
  "companyName": "Bridge Technologies Solutions",
  "address": "Akwa, Douala, Cameroun",
  "phone": "+237 233 XX XX XX",
  "email": "contact@bts.cm",
  "taxNumber": "M0123456789A",
  "currency": "XAF",
  "defaultTaxRate": 19.25,
  "invoicePrefix": "FAC",
  "proformaPrefix": "PFM",
  "paymentTermsDays": 30,
  "autoReminderDays": 3,
  "reminderEscalation": {
    "levels": [
      { "daysOverdue": 0,  "label": "Douce",    "notifyCreator": true,  "notifyManagers": false, "sendEmail": false },
      { "daysOverdue": 7,  "label": "Ferme",    "notifyCreator": true,  "notifyManagers": false, "sendEmail": true  },
      { "daysOverdue": 15, "label": "Urgente",  "notifyCreator": true,  "notifyManagers": true,  "sendEmail": true  },
      { "daysOverdue": 30, "label": "Critique", "notifyCreator": true,  "notifyManagers": true,  "sendEmail": true  }
    ]
  }
}
```

---

## Module 12 — Recurrences (`/api/recurring`)

### 12.1 Creer un template recurrent

**POST** `{{base_url}}/recurring`

```json
{
  "clientId": "{{client_id}}",
  "name": "Maintenance mensuelle Camtel",
  "frequency": "monthly",
  "dayOfMonth": 1,
  "nextRunAt": "2026-04-01",
  "autoIssue": true,
  "lines": [
    {
      "productId": "{{product_id}}",
      "designation": "Maintenance reseau",
      "quantity": 1,
      "unitPriceHt": 350000,
      "taxRate": 19.25
    }
  ]
}
```

---

### 12.2 Activer / desactiver

**POST** `{{base_url}}/recurring/TEMPLATE_ID/activate`

**POST** `{{base_url}}/recurring/TEMPLATE_ID/deactivate`

---

### 12.3 Generation manuelle

**POST** `{{base_url}}/recurring/TEMPLATE_ID/generate`

---

## Module 13 — Audit (`/api/audit-logs`) — Admin uniquement

### 13.1 Lister les logs d'audit

**GET** `{{base_url}}/audit-logs?page=1&limit=20`

Parametres : `table`, `action`, `userId`, `dateFrom`, `dateTo`

**Reponse attendue** :
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "action": "UPDATE",
      "table": "invoices",
      "recordId": "uuid",
      "oldData": { "status": "draft" },
      "newData": { "status": "issued" },
      "ipAddress": "41.202.xxx.xxx",
      "createdAt": "2026-03-12T10:00:00Z"
    }
  ],
  "meta": { "total": 150, "page": 1, "limit": 20, "pages": 8 }
}
```

---

## Scenarios complets

### Scenario A — Cycle facture standard

1. `POST /clients` -> sauver `client_id`
2. `POST /products` -> sauver `product_id`
3. `GET /clients/{{client_id}}/quick-fill` -> verifier l'historique
4. `POST /invoices/compute` -> verifier les totaux et avertissements
5. `POST /invoices` -> sauver `invoice_id`
6. `POST /invoices/{{invoice_id}}/issue` -> emettre
7. `GET /notifications` -> verifier la notification
8. `POST /invoices/{{invoice_id}}/payment` avec montant partiel
9. `GET /invoices/{{invoice_id}}` -> verifier `status = partially_paid`
10. `POST /invoices/{{invoice_id}}/payment` avec le solde restant
11. `GET /invoices/{{invoice_id}}` -> verifier `status = paid`
12. `GET /invoices/{{invoice_id}}/pdf` -> telecharger le PDF final

---

### Scenario B — Proforma vers facture

1. `POST /proformas` -> sauver `proforma_id`
2. `GET /proformas/{{proforma_id}}/pdf` -> verifier le PDF
3. `POST /proformas/{{proforma_id}}/send` -> statut sent
4. `POST /proformas/{{proforma_id}}/accept` -> statut accepted
5. `POST /proformas/{{proforma_id}}/convert` -> sauver `invoice_id`
6. `POST /invoices/{{invoice_id}}/issue` -> emettre

---

### Scenario C — Annulation et avoir automatique

1. Partir d'une facture `issued` ou `partially_paid`
2. `POST /invoices/{{invoice_id}}/cancel` avec reason
3. `GET /invoices?type=avoir` -> verifier l'avoir cree
4. Verifier que `data.linkedInvoiceId` pointe vers la facture annulee

---

### Scenario D — Facture acompte + solde

1. `POST /invoices` avec `"type": "acompte"` -> sauver `acompte_id`
2. `POST /invoices/{{acompte_id}}/issue`
3. `POST /invoices/{{acompte_id}}/payment`
4. `POST /invoices` avec `"type": "solde"` et `"linkedInvoiceId": "{{acompte_id}}"` -> sauver `solde_id`
5. `POST /invoices/{{solde_id}}/issue`
6. `POST /invoices/{{solde_id}}/payment`

---

### Scenario E — Activation 2FA complete

1. `POST /auth/login` sans 2FA -> sauver tokens
2. `POST /auth/2fa/enable` -> recuperer QR code
3. Scanner avec Google Authenticator / Authy
4. `POST /auth/2fa/verify` -> **sauvegarder les 8 codes de secours**
5. `POST /auth/logout`
6. `POST /auth/login` avec `totpToken` TOTP
7. `POST /auth/logout`
8. `POST /auth/login` avec un code de secours dans `totpToken`
9. `POST /auth/2fa/backup-codes` -> regenerer les codes

---

### Scenario F — Recherche intelligente

Tester ces requetes dans l'ordre :

```
GET /search?q=Camtel
GET /search?q=FAC-031
GET /search?q=impayes > 500000
GET /search?q=Camtel 2026
GET /search?q=brouillon mars 2026
GET /search?q=envoye >= 1M
GET /search?q=BTS/DC/2026/03/FAC001
```

---

### Scenario G — Relances d'escalade (test)

1. Creer et emettre une facture avec `dueDate` dans le passe (ex: il y a 10 jours)
2. Appeler manuellement le job : `POST /invoices/{{invoice_id}}/issue`
3. Attendre l'execution du cron `reminder` (00:15 UTC) ou simuler via l'interface BullMQ Board
4. Verifier que `reminderEscalationLevel` a ete incremente
5. Verifier la notification creee pour le createur de la facture

---

## Codes d'erreur courants

| Code HTTP | Cause |
|---|---|
| 400 | Corps ou parametres invalides (Zod) |
| 401 | JWT absent, expire, ou revoque |
| 403 | Role insuffisant |
| 404 | Ressource introuvable ou soft-deleted |
| 409 | Doublon (email, reference) |
| 422 | Transition de statut invalide (ex: emettre une facture deja emise) |
| 429 | Rate-limit atteint (PDF : 10/min) |
| 500 | Erreur interne — voir logs serveur |

---

## Variables Postman finales

Apres avoir execute les scenarios A a G :

```
base_url          = http://localhost:3000/api
access_token      = eyJ...
refresh_token     = eyJ...
user_id           = uuid
client_id         = uuid
product_id        = uuid
category_id       = uuid
invoice_id        = uuid
proforma_id       = uuid
commercial_id     = uuid
```
