# Déploiement en production — InvoiceHub v2/v3

> Ce fichier liste les commandes à taper sur le **serveur de prod** pour mettre à jour l'application.
> **Règle** : à chaque nouvelle fonctionnalité, une entrée est ajoutée dans le **journal** en bas
> avec les commandes *supplémentaires* à exécuter (migrations SQL, scripts de synchro, etc.).

---

## 1. Procédure standard (à chaque déploiement)

Depuis le dossier du backend (`invoicehub-api/`) :

```bash
# 1. Récupérer le code
git pull

# 2. Backend — dépendances + client Prisma + migrations + build
cd invoicehub-api
pnpm install
pnpm db:generate            # prisma generate (client à jour)
pnpm db:migrate             # prisma migrate deploy (applique les migrations en attente)
pnpm build

# 3. Frontend
cd ../bridge-frontend
pnpm install
pnpm build

# 4. Redémarrer les services
#   - PM2 :
pm2 restart invoicehub-api
pm2 restart bridge-frontend
#   - ou Docker :
#   docker compose -f invoicehub-api/docker-compose.yml up -d --build
```

> ⚠️ **Toujours faire une sauvegarde de la base avant** une mise à jour qui touche le schéma :
> ```bash
> pg_dump -U postgres -d invoicehub -F c -f backup_$(date +%F).dump
> ```

---

## 2. Commandes utiles (rappel)

| But | Commande (dans `invoicehub-api/`) |
|---|---|
| Appliquer les migrations | `pnpm db:migrate` |
| État des migrations | `pnpm db:status` |
| Régénérer le client Prisma | `pnpm db:generate` |
| Rafraîchir les templates email en base | `pnpm db:sync-emails` |
| Exécuter un fichier SQL ponctuel | `npx prisma db execute --file prisma/<fichier>.sql --schema prisma/schema.prisma` |

---

## 3. Journal par fonctionnalité (le plus récent en haut)

> Ces commandes sont **en plus** de la procédure standard, à ne lancer **qu'une seule fois** par
> environnement (elles sont idempotentes sauf mention contraire).

### 2026-07-01 — Couverture emails + identification InvoiceHub + sécurité
Commit `7ede4c9`. Nouveaux templates email (bon de commande, facture fournisseur, budget, compta),
objet préfixé `[InvoiceHub]`, échappement HTML.

```bash
cd invoicehub-api
# a) Aligner l'enum notification_status (valeurs v3 manquantes en base)
npx prisma db execute --file prisma/sync_notification_status_enum.sql --schema prisma/schema.prisma
# b) Rafraîchir/insérer les 22 templates email en base
pnpm db:sync-emails
```
> ⚠️ `db:sync-emails` **écrase** les templates personnalisés depuis l'interface (Paramètres →
> Notifications). Ne le relancer que si l'on veut repartir du design fourni par le code.

### 2026-06 — Option comptable « avances et acomptes reçus » (compte 4191)
Ajoute les colonnes `use_advance_account` / `advance_account` à `company_settings`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_advance_account_4191.sql --schema prisma/schema.prisma
```

---

## Modèle d'entrée (à copier pour chaque nouvelle fonctionnalité)

```
### AAAA-MM-JJ — Titre de la fonctionnalité
Commit `xxxxxxx`. Description courte.

​```bash
# commandes prod supplémentaires (migrations SQL, scripts…)
​```
> ⚠️ Notes / précautions éventuelles.
```
