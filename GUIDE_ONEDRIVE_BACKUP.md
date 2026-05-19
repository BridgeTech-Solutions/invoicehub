# Guide — Sauvegardes automatiques vers Microsoft OneDrive

**Projet** : InvoiceHub v2.0 — Bridge Technologies Solutions  
**Durée estimée** : 30 minutes  
**Prérequis** : Un compte administrateur Microsoft 365 de l'entreprise

---

## Vue d'ensemble

InvoiceHub sauvegarde automatiquement la base de données chaque nuit.  
Ce guide explique comment connecter ces sauvegardes à votre **OneDrive d'entreprise** (Microsoft 365), afin que les fichiers soient accessibles par toute l'équipe et protégés dans le cloud Microsoft.

```
Serveur InvoiceHub
      │
      │  chaque nuit à minuit
      ▼
  pg_dump (export BD)
      │
      │  compression .gz
      ▼
  Fichier backup
      │
      │  upload automatique
      ▼
OneDrive BTS / InvoiceHub / Backups /
  ├── invoicehub_db_20260420_000000.sql.gz     (BD seule)
  └── invoicehub_full_20260422_000000.tar.gz   (BD + logos + PDFs + avatars)
```

Le backup complet contient :
```
invoicehub_full_20260422_000000.tar.gz
├── database.sql     ← export complet de la base de données
└── uploads/
    ├── logos/       ← logo, tampon, signature entreprise
    ├── avatars/     ← photos de profil utilisateurs
    └── invoices/    ← PDFs générés (factures, proformas)
```

Après 30 jours, les anciens fichiers sont supprimés automatiquement.

---

## Pourquoi passer par portal.azure.com ?

Votre OneDrive d'entreprise appartient à Microsoft 365.  
Pour qu'une application externe (InvoiceHub) puisse y déposer des fichiers **sans intervention humaine**, Microsoft exige une autorisation officielle — exactement comme Google Drive exige une autorisation dans sa console pour un accès automatique.

Cette autorisation se gère sur **portal.azure.com**, qui est le panneau d'administration des identités Microsoft 365. Il est **inclus gratuitement** dans votre abonnement Microsoft 365 — vous ne payez rien de plus.

---

## Étape 1 — Se connecter au portail Microsoft

1. Ouvrir un navigateur et aller sur : **https://portal.azure.com**
2. Se connecter avec le **compte administrateur Microsoft 365 de BTS**  
   _(le compte qui gère les utilisateurs, les emails de l'entreprise)_

> Si vous n'êtes pas administrateur, demandez à votre responsable IT de réaliser
> les étapes 2, 3 et 4. Vous n'aurez qu'à récupérer les valeurs à la fin.

---

## Étape 2 — Créer l'application "InvoiceHub Backup"

Cette application représente InvoiceHub dans le système Microsoft. C'est elle qui aura le droit de déposer des fichiers dans OneDrive.

1. Dans la barre de recherche en haut, taper **"App registrations"**
2. Cliquer sur **"App registrations"** dans les résultats
3. Cliquer sur **"+ New registration"**

Remplir le formulaire :

| Champ | Valeur |
|-------|--------|
| Name | `InvoiceHub Backup` |
| Supported account types | _Accounts in this organizational directory only_ |
| Redirect URI | _(laisser vide)_ |

4. Cliquer sur **"Register"**

Vous arrivez sur la page de l'application. **Copier ces deux valeurs** dans un bloc-notes :

```
Application (client) ID  →  ONEDRIVE_CLIENT_ID
Directory (tenant) ID   →  ONEDRIVE_TENANT_ID
```

---

## Étape 3 — Créer le mot de passe de l'application

1. Dans le menu gauche, cliquer sur **"Certificates & secrets"**
2. Cliquer sur **"Client secrets"** puis **"+ New client secret"**

Remplir :

| Champ | Valeur |
|-------|--------|
| Description | `InvoiceHub Backup Secret` |
| Expires | `24 months` |

3. Cliquer sur **"Add"**

Un tableau apparaît avec le secret créé.

> **ATTENTION** : La colonne **"Value"** n'est visible qu'une seule fois.  
> Copier immédiatement cette valeur. Si vous fermez la page, vous devrez en créer un nouveau.

```
Colonne "Value"  →  ONEDRIVE_CLIENT_SECRET
```

---

## Étape 4 — Donner la permission d'accès à OneDrive

1. Dans le menu gauche, cliquer sur **"API permissions"**
2. Cliquer sur **"+ Add a permission"**
3. Choisir **"Microsoft Graph"**
4. Choisir **"Application permissions"** _(et non "Delegated permissions")_
5. Dans la barre de recherche, taper **"Files"**
6. Cocher **"Files.ReadWrite.All"**
7. Cliquer sur **"Add permissions"**

Maintenant, **accorder le consentement administrateur** :

8. Cliquer sur le bouton **"Grant admin consent for [nom de votre organisation]"**
9. Confirmer en cliquant **"Yes"**

Le statut doit afficher **"Granted for [organisation]"** avec une icône verte ✅.

---

## Étape 5 — (Optionnel) Trouver l'identifiant du drive OneDrive

Par défaut, les sauvegardes sont envoyées dans le OneDrive de l'application.  
Si vous souhaitez les envoyer dans le OneDrive d'un **utilisateur spécifique** de l'entreprise (ex : le compte IT de BTS) :

1. Aller sur **https://developer.microsoft.com/graph/graph-explorer**
2. Se connecter avec le compte de l'utilisateur cible
3. Dans la barre de requête, entrer :
   ```
   GET https://graph.microsoft.com/v1.0/me/drive
   ```
4. Cliquer **"Run query"**
5. Dans la réponse JSON, copier la valeur du champ **"id"**

```
"id": "xxxxxxxxxxxxxxxx"  →  ONEDRIVE_DRIVE_ID
```

> Si cette étape vous semble complexe, laissez `ONEDRIVE_DRIVE_ID` vide.
> Les sauvegardes fonctionneront quand même.

---

## Étape 6 — Configurer le fichier .env du serveur

Ouvrir le fichier `.env` à la racine du dossier `bridge-backend/` et modifier les lignes suivantes :

```env
# ── Sauvegardes ──────────────────────────────────────────────────
BACKUP_STORAGE_DISK=onedrive
BACKUP_RETENTION_DAYS=30
BACKUP_CRON=0 0 * * *

# true  = backup complet (BD + logos + PDFs + avatars) → .tar.gz
# false = base de données uniquement                   → .sql.gz
BACKUP_INCLUDE_FILES=true

# Dossier des fichiers uploadés (relatif à la racine du projet)
UPLOADS_DIR=./uploads

# ── OneDrive (Microsoft Graph API) ───────────────────────────────
ONEDRIVE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONEDRIVE_CLIENT_SECRET=VotreSecretCopieALetape3~xxxxxxxxx
ONEDRIVE_DRIVE_ID=                    # laisser vide si étape 5 non réalisée
ONEDRIVE_FOLDER_PATH=InvoiceHub/Backups
```

Remplacer chaque valeur par ce qui a été copié aux étapes précédentes.

---

## Étape 7 — Redémarrer le serveur

```bash
docker-compose down
docker-compose up -d
```

Le dossier **InvoiceHub/Backups** sera créé automatiquement dans OneDrive lors du premier backup.

---

## Vérification

### Déclencher un backup manuel

Via l'interface d'administration InvoiceHub :  
**Paramètres → Sauvegardes → Lancer une sauvegarde**

Ou via l'API :
```bash
curl -X POST https://votre-serveur/api/v1/backups/trigger \
  -H "Authorization: Bearer <token-admin>"
```

### Voir le fichier dans OneDrive

1. Ouvrir **https://www.office.com** → OneDrive
2. Naviguer vers **InvoiceHub / Backups**
3. Le fichier `invoicehub_AAAAMMJJ_HHMMSS.sql.gz` doit apparaître

---

## Récapitulatif des valeurs à collecter

| Variable .env | Où la trouver |
|---------------|---------------|
| `ONEDRIVE_TENANT_ID` | portal.azure.com → App registration → Overview → _Directory (tenant) ID_ |
| `ONEDRIVE_CLIENT_ID` | portal.azure.com → App registration → Overview → _Application (client) ID_ |
| `ONEDRIVE_CLIENT_SECRET` | portal.azure.com → App registration → Certificates & secrets → _Value_ |
| `ONEDRIVE_DRIVE_ID` | graph-explorer → GET /me/drive → champ _id_ (optionnel) |
| `ONEDRIVE_FOLDER_PATH` | Libre choix — dossier créé automatiquement dans OneDrive |

---

## Comportement automatique

| Événement | Ce qui se passe |
|-----------|----------------|
| Chaque nuit à minuit | Export BD → compression → upload OneDrive |
| Backup manuel (admin) | Même processus, déclenché immédiatement |
| Fichier > 30 jours | Supprimé automatiquement de OneDrive |
| Téléchargement | Lien temporaire OneDrive généré (valable 1 heure) |
| Erreur réseau | Erreur enregistrée en base, alerte dans les logs |

---

## Questions fréquentes

**Q : Est-ce que ça coûte quelque chose ?**  
R : Non. L'accès à l'API Microsoft Graph est inclus dans tout abonnement Microsoft 365. Aucun service Azure payant n'est activé.

**Q : Qui peut voir les sauvegardes dans OneDrive ?**  
R : Uniquement les personnes ayant accès au dossier OneDrive où elles sont stockées. Vous pouvez restreindre l'accès à ce dossier depuis l'interface OneDrive normalement.

**Q : Le mot de passe (CLIENT_SECRET) expire dans 24 mois. Que faire ?**  
R : Retourner sur portal.azure.com → App registrations → InvoiceHub Backup → Certificates & secrets → créer un nouveau secret → mettre à jour le `.env` → redémarrer le serveur.

**Q : Peut-on sauvegarder vers un dossier SharePoint plutôt que OneDrive ?**  
R : Oui. Récupérer l'identifiant du drive SharePoint via :  
`GET https://graph.microsoft.com/v1.0/sites/{siteId}/drive`  
Et le mettre dans `ONEDRIVE_DRIVE_ID`.
