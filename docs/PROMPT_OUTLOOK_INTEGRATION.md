# PROMPT — Intégration Microsoft Outlook / Graph API (BRIDGE / InvoiceHub v2.0)

## Règle absolue — À lire avant toute modification

**Avant de toucher à n'importe quel fichier existant, tu dois :**
1. Lire le fichier en entier pour comprendre sa logique actuelle
2. Identifier tous les endroits où ta modification peut avoir un impact indirect
3. Ne jamais supprimer ou réécrire une logique existante qui fonctionne — étendre, pas remplacer
4. Vérifier les imports existants avant d'en ajouter de nouveaux
5. Confirmer que le build TypeScript (`pnpm tsc --noEmit`) passe EXIT 0 après chaque phase

Cette règle s'applique en particulier à : `mailer.ts`, `email.processor.ts`, `invoices.service.ts`, `proformas.service.ts`, `notifications.service.ts`, `env.ts`, `prisma/schema.prisma`.

---

## Contexte du projet

**InvoiceHub v2.0** — Plateforme de gestion financière enterprise pour Bridge Technologies Solutions (BTS), Douala, Cameroun. Stack :

- **Backend** : Node.js + Express + TypeScript + Prisma ORM + PostgreSQL 15+
- **Queue** : BullMQ + Redis (`emailQueue` avec 3 tentatives + backoff exponentiel)
- **Frontend** : Next.js 15 (App Router) + TypeScript + TanStack Query v5 + Zustand
- **Auth** : JWT (15min access + 7j refresh) + 2FA TOTP
- **Microsoft** : BTS possède déjà un tenant Microsoft 365 — variables `ONEDRIVE_TENANT_ID`, `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET` existent déjà dans `env.ts` pour les backups OneDrive

---

## Problème à résoudre

Actuellement :
- L'envoi d'email depuis BRIDGE utilise un SMTP central (`noreply@bts.cm`)
- **Le code d'envoi email est commenté** dans `invoices.service.ts` (méthode `issue`) et `proformas.service.ts` (méthode `send`) — jamais activé en production
- Les employés envoient les documents par WhatsApp car ils veulent utiliser **leur propre adresse Outlook** (`armelle.mbida@bts.cm`)
- Problèmes résultants : adresse inconnue du client, fil de conversation cassé, signature absente, pas de traçabilité

## Solution à construire

Une intégration **Microsoft Graph API** permettant à chaque employé de :
1. Connecter son compte Microsoft 365 Outlook à BRIDGE (OAuth2, une seule fois)
2. Composer un email depuis BRIDGE (destinataire, objet, corps, CC) avec le PDF en pièce jointe
3. Choisir de **répondre à un fil de conversation existant** avec le client (thread picker)
4. Soit **ouvrir le brouillon dans Outlook** pour révision finale avant envoi
5. Soit **envoyer directement** via l'API sans ouvrir Outlook

Si l'employé n'a pas connecté son Outlook → fallback automatique vers le SMTP BTS.

---

## 1. VARIABLES D'ENVIRONNEMENT

### Fichier : `bridge-backend/src/config/env.ts`

**Lire le fichier en entier avant modification.** Ajouter dans le schéma Zod existant, dans la section Microsoft (après les variables OneDrive existantes) :

```typescript
// ── Microsoft Graph API — Outlook Mail ──────────────────────────────────────
// NB : ONEDRIVE_TENANT_ID / CLIENT_ID / CLIENT_SECRET sont déjà définis pour
// les backups. Si le même Azure App est réutilisé pour Outlook, ces variables
// peuvent être partagées. Sinon, créer une App Azure séparée avec les scopes Mail.
OUTLOOK_TENANT_ID:     z.string().optional(),   // Peut pointer vers ONEDRIVE_TENANT_ID
OUTLOOK_CLIENT_ID:     z.string().optional(),   // App Azure avec scopes Mail.*
OUTLOOK_CLIENT_SECRET: z.string().optional(),
OUTLOOK_REDIRECT_URI:  z.string().url().optional(),  // ex: https://app.bts.cm/api/auth/outlook/callback
```

**Règle** : si `OUTLOOK_TENANT_ID` n'est pas défini, toute la fonctionnalité Outlook est désactivée gracieusement (fallback SMTP). Ne jamais faire crasher le serveur si ces variables sont absentes.

---

## 2. SCHÉMA PRISMA — Extensions User

### Fichier : `bridge-backend/prisma/schema.prisma`

**Lire le modèle `User` en entier avant modification.** Le modèle `User` n'a actuellement aucun champ pour les tokens OAuth Microsoft.

Ajouter ces champs au modèle `User` existant :

```prisma
// ── Intégration Microsoft Outlook ─────────────────────────────
outlookConnected       Boolean   @default(false) @map("outlook_connected")
outlookEmail           String?   @map("outlook_email") @db.VarChar(255)
outlookAccessToken     String?   @map("outlook_access_token") @db.Text      // Chiffré en AES-256 avant stockage
outlookRefreshToken    String?   @map("outlook_refresh_token") @db.Text     // Chiffré en AES-256 avant stockage
outlookTokenExpiresAt  DateTime? @map("outlook_token_expires_at")
```

**Sécurité obligatoire** : Les tokens `outlookAccessToken` et `outlookRefreshToken` doivent être chiffrés en AES-256-GCM avant écriture en base et déchiffrés à la lecture. Utiliser `crypto.createCipheriv` avec `APP_SECRET` (variable existante ou nouvelle `TOKEN_ENCRYPTION_KEY` de 32 bytes).

**Après modification du schéma** : répercuter dans `invoicehub_schema_v3.sql` :
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_connected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_token_expires_at TIMESTAMPTZ;
```

### Champ `lastEmailSentAt` — Modèles `Invoice` et `Proforma`

**Lire les modèles `Invoice` et `Proforma` dans `schema.prisma` avant modification.** Ajouter le champ suivant à chacun :

```prisma
// Dans le modèle Invoice :
lastEmailSentAt  DateTime? @map("last_email_sent_at")

// Dans le modèle Proforma :
lastEmailSentAt  DateTime? @map("last_email_sent_at")
```

Répercuter dans `invoicehub_schema_v3.sql` :
```sql
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
```

**Comportement attendu :**
- **Proforma en `draft`** : après envoi email direct → `proformasService.send()` est appelé → statut passe à `sent` + historique de statut créé + `lastEmailSentAt` mis à jour. Ne jamais appeler `prisma.proforma.update` directement pour changer le statut.
- **Proforma déjà `sent`/`accepted`/autre** : seul `lastEmailSentAt` est mis à jour (le statut ne régresse pas).
- **Facture** : statut inchangé (déjà `issued`), seulement `lastEmailSentAt` mis à jour.
- **Mode "Ouvrir dans Outlook"** : AUCUNE mise à jour du document — l'employé peut annuler depuis Outlook. La mise à jour n'a lieu qu'après `sendDirect` confirmé.

**Affichage dans l'UI (optionnel mais recommandé)** : Dans la vue détail d'une facture ou d'un proforma, afficher `lastEmailSentAt` comme `"Dernière fois envoyé par email : 24 avril 2026 à 14h32"` si le champ est défini.

---

## 3. BACKEND — Librairie Microsoft Graph

### Fichier : `bridge-backend/src/lib/microsoftGraph.ts` (nouveau)

Installe le package : `pnpm add @microsoft/microsoft-graph-client @azure/identity`

Ce fichier centralise toute la logique Microsoft Graph. Ne pas disperser la logique OAuth dans les controllers.

```typescript
import { Client } from '@microsoft/microsoft-graph-client'
import crypto from 'crypto'
import { prisma } from '../config/database'
import { env } from '../config/env'
import { AppError } from '../core/errors/AppError'

// ─── Chiffrement des tokens ────────────────────────────────────
const ENCRYPTION_KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex')  // 32 bytes

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, dataHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// ─── OAuth2 — URL d'autorisation ──────────────────────────────
export function getOAuthUrl(userId: string): string {
  if (!env.OUTLOOK_CLIENT_ID || !env.OUTLOOK_TENANT_ID) {
    throw AppError.badRequest('Intégration Outlook non configurée sur ce serveur')
  }
  const params = new URLSearchParams({
    client_id:     env.OUTLOOK_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  env.OUTLOOK_REDIRECT_URI!,
    scope:         'Mail.Send Mail.ReadWrite Mail.Read offline_access',
    state:         userId,  // Retourné par Microsoft pour identifier l'utilisateur
    response_mode: 'query',
  })
  return `https://login.microsoftonline.com/${env.OUTLOOK_TENANT_ID}/oauth2/v2.0/authorize?${params}`
}

// ─── OAuth2 — Échange code contre tokens ──────────────────────
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken:  string
  refreshToken: string
  expiresAt:    Date
  email:        string
}> {
  const response = await fetch(
    `https://login.microsoftonline.com/${env.OUTLOOK_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.OUTLOOK_CLIENT_ID!,
        client_secret: env.OUTLOOK_CLIENT_SECRET!,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  env.OUTLOOK_REDIRECT_URI!,
        scope:         'Mail.Send Mail.ReadWrite Mail.Read offline_access',
      }),
    }
  )
  if (!response.ok) throw AppError.badRequest('Échec OAuth Microsoft')
  const data = await response.json()
  // Décoder le JWT access_token pour extraire l'email (champ upn ou preferred_username)
  const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString())
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    new Date(Date.now() + data.expires_in * 1000),
    email:        payload.preferred_username ?? payload.upn ?? payload.email,
  }
}

// ─── Refresh du token si expiré ───────────────────────────────
export async function refreshAccessToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.outlookRefreshToken) throw AppError.unauthorized('Outlook non connecté')

  const decryptedRefresh = decryptToken(user.outlookRefreshToken)
  const response = await fetch(
    `https://login.microsoftonline.com/${env.OUTLOOK_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.OUTLOOK_CLIENT_ID!,
        client_secret: env.OUTLOOK_CLIENT_SECRET!,
        refresh_token: decryptedRefresh,
        grant_type:    'refresh_token',
        scope:         'Mail.Send Mail.ReadWrite Mail.Read offline_access',
      }),
    }
  )
  if (!response.ok) {
    // Token révoqué — déconnecter proprement
    await prisma.user.update({
      where: { id: userId },
      data: { outlookConnected: false, outlookAccessToken: null, outlookRefreshToken: null, outlookTokenExpiresAt: null },
    })
    throw AppError.unauthorized('Session Outlook expirée. Veuillez reconnecter votre compte.')
  }
  const data = await response.json()
  const newEncryptedAccess = encryptToken(data.access_token)
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await prisma.user.update({
    where: { id: userId },
    data: { outlookAccessToken: newEncryptedAccess, outlookTokenExpiresAt: expiresAt },
  })
  return data.access_token
}

// ─── Obtenir un client Graph valide (avec auto-refresh) ────────
export async function getGraphClient(userId: string): Promise<Client> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.outlookConnected || !user.outlookAccessToken) {
    throw AppError.badRequest('Compte Outlook non connecté')
  }

  let accessToken: string
  const now = new Date()
  const expiresAt = user.outlookTokenExpiresAt

  if (!expiresAt || expiresAt <= new Date(now.getTime() + 60_000)) {
    // Expiré ou expire dans moins d'1 minute → refresh
    accessToken = await refreshAccessToken(userId)
  } else {
    accessToken = decryptToken(user.outlookAccessToken)
  }

  return Client.init({
    authProvider: (done) => done(null, accessToken),
  })
}

// ─── Récupérer les conversations récentes avec un email client ─
export async function getRecentThreadsWithClient(
  userId: string,
  clientEmail: string,
  limit = 10
): Promise<Array<{
  id:          string   // messageId du dernier message du fil
  subject:     string
  lastSender:  string
  lastDate:    string
  preview:     string
  conversationId: string
}>> {
  const client = await getGraphClient(userId)
  // Chercher les messages où le client est expéditeur ou destinataire
  const response = await client
    .api('/me/messages')
    .filter(`from/emailAddress/address eq '${clientEmail}' or toRecipients/any(t:t/emailAddress/address eq '${clientEmail}')`)
    .select('id,subject,from,toRecipients,receivedDateTime,bodyPreview,conversationId')
    .orderby('receivedDateTime desc')
    .top(limit * 3)  // Plus large pour dédupliquer par fil
    .get()

  // Dédupliquer par conversationId — garder le message le plus récent de chaque fil
  const seen = new Map<string, any>()
  for (const msg of response.value ?? []) {
    if (!seen.has(msg.conversationId)) {
      seen.set(msg.conversationId, msg)
    }
  }

  return Array.from(seen.values()).slice(0, limit).map((msg) => ({
    id:             msg.id,
    subject:        msg.subject ?? '(Sans objet)',
    lastSender:     msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? '',
    lastDate:       msg.receivedDateTime,
    preview:        msg.bodyPreview ?? '',
    conversationId: msg.conversationId,
  }))
}

// ─── Créer un brouillon (nouveau mail ou réponse à un fil) ─────
export async function createDraft(params: {
  userId:        string
  to:            string
  subject:       string
  bodyHtml:      string
  cc?:           string[]
  pdfBuffer:     Buffer
  pdfFilename:   string
  replyToMessageId?: string  // Si défini → crée une réponse dans ce fil
}): Promise<{ draftId: string; outlookUrl: string }> {
  const client = await getGraphClient(params.userId)

  const attachmentContent = params.pdfBuffer.toString('base64')

  if (params.replyToMessageId) {
    // ── Réponse dans un fil existant ──────────────────────────
    // 1. Créer le brouillon de réponse
    const draft = await client
      .api(`/me/messages/${params.replyToMessageId}/createReply`)
      .post({})

    // 2. Mettre à jour le brouillon avec le corps et la pièce jointe
    await client.api(`/me/messages/${draft.id}`).patch({
      body: { contentType: 'html', content: params.bodyHtml },
      toRecipients: [{ emailAddress: { address: params.to } }],
      ...(params.cc?.length ? {
        ccRecipients: params.cc.map((c) => ({ emailAddress: { address: c } }))
      } : {}),
    })

    // 3. Attacher le PDF
    await client.api(`/me/messages/${draft.id}/attachments`).post({
      '@odata.type':  '#microsoft.graph.fileAttachment',
      name:           params.pdfFilename,
      contentType:    'application/pdf',
      contentBytes:   attachmentContent,
    })

    return {
      draftId:     draft.id,
      outlookUrl: `https://outlook.office.com/mail/deeplink/compose?messageId=${draft.id}`,
    }
  } else {
    // ── Nouveau mail ──────────────────────────────────────────
    const draft = await client.api('/me/messages').post({
      subject: params.subject,
      body:    { contentType: 'html', content: params.bodyHtml },
      toRecipients: [{ emailAddress: { address: params.to } }],
      ...(params.cc?.length ? {
        ccRecipients: params.cc.map((c) => ({ emailAddress: { address: c } }))
      } : {}),
      attachments: [{
        '@odata.type':  '#microsoft.graph.fileAttachment',
        name:           params.pdfFilename,
        contentType:    'application/pdf',
        contentBytes:   attachmentContent,
      }],
    })

    return {
      draftId:     draft.id,
      outlookUrl: `https://outlook.office.com/mail/deeplink/compose?messageId=${draft.id}`,
    }
  }
}

// ─── Envoyer directement (sans ouvrir Outlook) ────────────────
export async function sendDirect(draftId: string, userId: string): Promise<void> {
  const client = await getGraphClient(userId)
  await client.api(`/me/messages/${draftId}/send`).post({})
}
```

---

## 4. BACKEND — Module `outlook`

### Fichier : `bridge-backend/src/modules/outlook/outlook.schema.ts`

```typescript
import { z } from 'zod'

// Payload envoyé par le frontend pour composer et envoyer un email
export const sendDocumentEmailSchema = z.object({
  documentType:      z.enum(['invoice', 'proforma']),
  documentId:        z.string().uuid(),
  to:                z.string().email(),
  subject:           z.string().min(1).max(500),
  bodyHtml:          z.string().min(1),
  cc:                z.array(z.string().email()).default([]),
  replyToMessageId:  z.string().optional(),  // ID du message Outlook à répondre
  openInOutlook:     z.boolean().default(false),  // true = retourner URL Outlook, false = envoyer direct
})

export type SendDocumentEmailInput = z.infer<typeof sendDocumentEmailSchema>
```

### Fichier : `bridge-backend/src/modules/outlook/outlook.service.ts`

**Lire `mailer.ts`, `invoices.service.ts` et `proformas.service.ts` en entier avant d'implémenter.**

```typescript
import { prisma } from '../../config/database'
import { AppError } from '../../core/errors/AppError'
import { getRecentThreadsWithClient, createDraft, sendDirect } from '../../lib/microsoftGraph'
import { generateInvoicePdf } from '../../lib/pdf'  // Fonction PDF existante
import { emailQueue } from '../../jobs/queues'
import type { SendDocumentEmailInput } from './outlook.schema'

export class OutlookService {

  // ── Connexion OAuth — stocker les tokens ──────────────────────
  async handleOAuthCallback(userId: string, code: string): Promise<void> {
    const { accessToken, refreshToken, expiresAt, email } = await exchangeCodeForTokens(code)
    await prisma.user.update({
      where: { id: userId },
      data: {
        outlookConnected:      true,
        outlookEmail:          email,
        outlookAccessToken:    encryptToken(accessToken),
        outlookRefreshToken:   encryptToken(refreshToken),
        outlookTokenExpiresAt: expiresAt,
      },
    })
  }

  // ── Déconnexion — révoquer et effacer les tokens ──────────────
  async disconnect(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        outlookConnected:      false,
        outlookEmail:          null,
        outlookAccessToken:    null,
        outlookRefreshToken:   null,
        outlookTokenExpiresAt: null,
      },
    })
  }

  // ── Statut de connexion ───────────────────────────────────────
  async getStatus(userId: string): Promise<{
    connected: boolean
    email:     string | null
    expiresAt: Date | null
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { outlookConnected: true, outlookEmail: true, outlookTokenExpiresAt: true },
    })
    return {
      connected: user?.outlookConnected ?? false,
      email:     user?.outlookEmail ?? null,
      expiresAt: user?.outlookTokenExpiresAt ?? null,
    }
  }

  // ── Conversations récentes avec un client ─────────────────────
  async getClientThreads(userId: string, clientId: string): Promise<any[]> {
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client?.email) throw AppError.badRequest('Ce client n\'a pas d\'adresse email')

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { outlookConnected: true },
    })
    if (!user?.outlookConnected) return []  // Silencieux si non connecté

    return getRecentThreadsWithClient(userId, client.email)
  }

  // ── Envoyer / créer un brouillon ─────────────────────────────
  async sendDocumentEmail(input: SendDocumentEmailInput, userId: string): Promise<{
    sent:        boolean
    outlookUrl?: string   // Défini si openInOutlook = true
    fallback?:   boolean  // true si envoyé via SMTP (Outlook non connecté)
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { outlookConnected: true },
    })

    // ── Générer le PDF ──────────────────────────────────────────
    let pdfBuffer: Buffer
    let pdfFilename: string

    if (input.documentType === 'invoice') {
      const invoice = await prisma.invoice.findUnique({
        where: { id: input.documentId },
        include: { client: true, lines: true },
      })
      if (!invoice) throw AppError.notFound('Facture introuvable')
      pdfBuffer   = await generateInvoicePdf(invoice)
      pdfFilename = `Facture-${invoice.number ?? invoice.id}.pdf`
    } else {
      const proforma = await prisma.proforma.findUnique({
        where: { id: input.documentId },
        include: { client: true, lines: true },
      })
      if (!proforma) throw AppError.notFound('Proforma introuvable')
      pdfBuffer   = await generateProformaPdf(proforma)
      pdfFilename = `Proforma-${proforma.number ?? proforma.id}.pdf`
    }

    // ── Fallback SMTP si Outlook non connecté ───────────────────
    if (!user?.outlookConnected) {
      await emailQueue.add('email', {
        to:      input.to,
        subject: input.subject,
        html:    input.bodyHtml,
        // Note : pièce jointe non supportée dans la queue actuelle
        // → À étendre EmailJobData si nécessaire
      })
      return { sent: true, fallback: true }
    }

    // ── Créer le brouillon via Graph API ─────────────────────────
    const { draftId, outlookUrl } = await createDraft({
      userId:          userId,
      to:              input.to,
      subject:         input.subject,
      bodyHtml:        input.bodyHtml,
      cc:              input.cc,
      pdfBuffer,
      pdfFilename,
      replyToMessageId: input.replyToMessageId,
    })

    if (input.openInOutlook) {
      // Retourner l'URL Outlook — le frontend ouvre l'onglet
      // Note : on ne marque PAS le document comme envoyé ici — l'employé
      // peut encore annuler depuis Outlook. Le statut sera mis à jour seulement
      // après envoi effectif (mode direct) ou ignoré (mode brouillon Outlook).
      return { sent: false, outlookUrl }
    } else {
      // Envoyer directement
      await sendDirect(draftId, userId)

      // ── Mise à jour du statut du document après envoi réel ────────
      // Lire proformas.service.ts et invoices.service.ts avant d'implémenter.
      await this._markDocumentAsSent(input.documentType, input.documentId, userId)

      return { sent: true }
    }
  }

  // ── Mise à jour du document après envoi email réussi ─────────
  // Appelé UNIQUEMENT après sendDirect (envoi confirmé), pas après openInOutlook.
  private async _markDocumentAsSent(
    documentType: 'invoice' | 'proforma',
    documentId: string,
    userId: string
  ): Promise<void> {
    if (documentType === 'proforma') {
      // Lire proformas.service.ts → méthode send() avant modification.
      // Si le proforma est encore en draft → le passer en "sent" via le service existant
      // pour déclencher l'historique de statut, les notifications, etc.
      // NE PAS appeler prisma.proforma.update directement — passer par proformasService.send()
      // pour ne pas court-circuiter la logique métier existante.
      const proforma = await prisma.proforma.findUnique({
        where: { id: documentId },
        select: { status: true, deletedAt: true },
      })
      if (!proforma || proforma.deletedAt) return

      if (proforma.status === 'draft') {
        // Importer proformasService et appeler send() — il gère le statut, l'historique et les notifications
        // import { proformasService } from '../proformas/proformas.service'
        await proformasService.send(documentId, userId)
      } else {
        // Proforma déjà en "sent", "accepted", etc. → juste enregistrer lastEmailSentAt
        await prisma.proforma.update({
          where: { id: documentId },
          data:  { lastEmailSentAt: new Date() },
        })
      }
    } else if (documentType === 'invoice') {
      // Les factures ont leur propre cycle (draft → issued → paid).
      // L'envoi email ne change pas le statut (la facture est déjà "issued").
      // On enregistre uniquement lastEmailSentAt pour la traçabilité.
      await prisma.invoice.update({
        where: { id: documentId },
        data:  { lastEmailSentAt: new Date() },
      })
    }
  }

  // ── Prévisualiser le corps du mail (avec variables) ───────────
  async previewEmailBody(documentType: 'invoice' | 'proforma', documentId: string): Promise<{
    to:      string
    subject: string
    body:    string
  }> {
    if (documentType === 'invoice') {
      const invoice = await prisma.invoice.findUnique({
        where: { id: documentId },
        include: { client: true },
      })
      if (!invoice) throw AppError.notFound('Facture introuvable')
      return {
        to:      invoice.client.email ?? '',
        subject: `Facture ${invoice.number} — Bridge Technologies Solutions`,
        body:    buildInvoiceEmailBody(invoice),
      }
    } else {
      const proforma = await prisma.proforma.findUnique({
        where: { id: documentId },
        include: { client: true },
      })
      if (!proforma) throw AppError.notFound('Proforma introuvable')
      return {
        to:      proforma.client.email ?? '',
        subject: `Proforma ${proforma.number} — Bridge Technologies Solutions`,
        body:    buildProformaEmailBody(proforma),
      }
    }
  }
}

// ── Générateurs de corps d'email ──────────────────────────────
// Ces fonctions remplacent le code commenté dans invoices.service.ts et proformas.service.ts.
// Elles ne touchent PAS aux services existants — elles sont nouvelles.

function buildInvoiceEmailBody(invoice: any): string {
  const clientName = invoice.client?.name ?? 'Madame/Monsieur'
  const amount = new Intl.NumberFormat('fr-FR').format(Number(invoice.totalTtc))
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  return `<p>Bonjour ${clientName},</p>
<p>Veuillez trouver ci-joint la facture n° <strong>${invoice.number}</strong> d'un montant de <strong>${amount} XAF TTC</strong>${dueDate ? `, à régler avant le ${dueDate}` : ''}.</p>
<p>N'hésitez pas à nous contacter pour toute question.</p>
<p>Cordialement,</p>`
}

function buildProformaEmailBody(proforma: any): string {
  const clientName = proforma.client?.name ?? 'Madame/Monsieur'
  const amount = new Intl.NumberFormat('fr-FR').format(Number(proforma.totalTtc))
  const validUntil = proforma.validUntil
    ? new Date(proforma.validUntil).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  return `<p>Bonjour ${clientName},</p>
<p>Veuillez trouver ci-joint le devis n° <strong>${proforma.number}</strong> d'un montant de <strong>${amount} XAF TTC</strong>${validUntil ? `, valable jusqu'au ${validUntil}` : ''}.</p>
<p>Dans l'attente de votre retour, nous restons à votre disposition.</p>
<p>Cordialement,</p>`
}

export const outlookService = new OutlookService()
```

### Fichier : `bridge-backend/src/modules/outlook/outlook.controller.ts`

```typescript
import { Request, Response, NextFunction } from 'express'
import { outlookService } from './outlook.service'
import { sendDocumentEmailSchema } from './outlook.schema'
import { getOAuthUrl } from '../../lib/microsoftGraph'

export class OutlookController {
  // GET /outlook/auth-url — Retourne l'URL OAuth Microsoft
  async getAuthUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = getOAuthUrl(req.user!.id)
      res.json({ success: true, data: { url } })
    } catch (err) { next(err) }
  }

  // GET /outlook/callback — Callback OAuth Microsoft (reçoit ?code=...&state=userId)
  async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state: userId } = req.query as { code: string; state: string }
      if (!code || !userId) {
        res.redirect(`${process.env.APP_URL}/profile?outlook=error`)
        return
      }
      await outlookService.handleOAuthCallback(userId, code)
      // Rediriger vers la page profil avec message de succès
      res.redirect(`${process.env.APP_URL}/profile?outlook=connected`)
    } catch (err) {
      res.redirect(`${process.env.APP_URL}/profile?outlook=error`)
    }
  }

  // GET /outlook/status — Statut de connexion de l'utilisateur courant
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await outlookService.getStatus(req.user!.id)
      res.json({ success: true, data })
    } catch (err) { next(err) }
  }

  // DELETE /outlook/disconnect — Déconnecter
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await outlookService.disconnect(req.user!.id)
      res.json({ success: true, message: 'Compte Outlook déconnecté' })
    } catch (err) { next(err) }
  }

  // GET /outlook/threads?clientId=... — Conversations récentes
  async getClientThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { clientId } = req.query as { clientId: string }
      const data = await outlookService.getClientThreads(req.user!.id, clientId)
      res.json({ success: true, data })
    } catch (err) { next(err) }
  }

  // GET /outlook/preview?documentType=...&documentId=... — Prévisualisation
  async previewEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentType, documentId } = req.query as { documentType: 'invoice' | 'proforma'; documentId: string }
      const data = await outlookService.previewEmailBody(documentType, documentId)
      res.json({ success: true, data })
    } catch (err) { next(err) }
  }

  // POST /outlook/send — Envoyer ou créer brouillon
  async sendEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = sendDocumentEmailSchema.parse(req.body)
      const data = await outlookService.sendDocumentEmail(input, req.user!.id)
      res.json({ success: true, data })
    } catch (err) { next(err) }
  }
}

export const outlookController = new OutlookController()
```

### Fichier : `bridge-backend/src/modules/outlook/outlook.routes.ts`

**Attention** : La route `/callback` doit être accessible SANS `authenticate` middleware (Microsoft redirige un navigateur, pas un client authentifié JWT). Toutes les autres routes sont protégées.

```typescript
import { Router } from 'express'
import { outlookController as ctrl } from './outlook.controller'
import { authenticate } from '../../core/middleware/auth'
import { auditMiddleware } from '../../core/middleware/audit'

const router = Router()

// Route publique — callback OAuth Microsoft (pas de authenticate)
router.get('/callback', ctrl.handleCallback.bind(ctrl))

// Routes protégées
router.use(authenticate)

router.get('/auth-url',    ctrl.getAuthUrl.bind(ctrl))
router.get('/status',      ctrl.getStatus.bind(ctrl))
router.delete('/disconnect', auditMiddleware('user', 'UPDATE'), ctrl.disconnect.bind(ctrl))
router.get('/threads',     ctrl.getClientThreads.bind(ctrl))
router.get('/preview',     ctrl.previewEmail.bind(ctrl))
router.post('/send',       auditMiddleware('outlook_email', 'EMAIL_SENT'), ctrl.sendEmail.bind(ctrl))

export { router as outlookRouter }
```

Monter dans `app.ts` :
```typescript
import { outlookRouter } from './modules/outlook/outlook.routes'
app.use(`${API_PREFIX}/outlook`, outlookRouter)
```

---

## 5. MODIFICATION DES SERVICES EXISTANTS — Code commenté

**Lire `invoices.service.ts` et `proformas.service.ts` en entier avant modification.**

### invoices.service.ts — méthode `issue()`

Le code d'envoi email est actuellement commenté. **Ne pas le décommenter tel quel** — le remplacer par une notification in-app uniquement. L'envoi via Outlook est déclenché **explicitement** par l'employé via le drawer de composition, pas automatiquement au moment de l'émission.

Remplacer le bloc commenté par :
```typescript
// Notification in-app pour l'émetteur
await notificationQueue.add('notify', {
  userId: userId,
  type: 'invoice_issued',
  title: `Facture ${updatedInvoice.number} émise`,
  message: `La facture pour ${updatedInvoice.client?.name} est prête à être envoyée au client.`,
  data: { invoiceId: id },
})
```

### proformas.service.ts — méthode `send()`

Même principe. Remplacer le bloc commenté par une notification in-app. L'envoi réel se fait depuis le drawer.

---

## 6. QUEUE EMAIL — Extension pour pièces jointes

### Fichier : `bridge-backend/src/jobs/queues.ts`

**Lire le fichier en entier avant modification.** Étendre l'interface `EmailJobData` pour supporter les pièces jointes (nécessaire pour le fallback SMTP) :

```typescript
export interface EmailJobData {
  to:      string
  subject: string
  html:    string
  replyTo?: string
  // Extension pour pièces jointes (fallback SMTP)
  attachments?: Array<{
    filename: string
    content:  string  // Base64
    contentType: string
  }>
}
```

### Fichier : `bridge-backend/src/jobs/processors/email.processor.ts`

**Lire le fichier en entier avant modification.** Étendre `processEmailJob` pour passer les pièces jointes à `sendMail` si présentes.

---

## 7. FRONTEND — Types et API

### Fichier : `bridge-frontend/src/features/outlook/types.ts` (nouveau)

```typescript
export interface OutlookStatus {
  connected: boolean
  email:     string | null
  expiresAt: string | null
}

export interface OutlookThread {
  id:             string   // Message ID du dernier message
  subject:        string
  lastSender:     string
  lastDate:       string
  preview:        string
  conversationId: string
}

export interface EmailPreview {
  to:      string
  subject: string
  body:    string
}

export interface SendDocumentEmailPayload {
  documentType:     'invoice' | 'proforma'
  documentId:       string
  to:               string
  subject:          string
  bodyHtml:         string
  cc:               string[]
  replyToMessageId?: string
  openInOutlook:    boolean
}

export interface SendEmailResult {
  sent:        boolean
  outlookUrl?: string
  fallback?:   boolean
}
```

### Fichier : `bridge-frontend/src/features/outlook/api.ts` (nouveau)

```typescript
import apiClient from '@/lib/api-client'
import type { OutlookStatus, OutlookThread, EmailPreview, SendDocumentEmailPayload, SendEmailResult } from './types'

export const outlookApi = {
  getAuthUrl: () =>
    apiClient.get<{ url: string }>('/outlook/auth-url').then(r => r.data.data),

  getStatus: () =>
    apiClient.get<OutlookStatus>('/outlook/status').then(r => r.data.data),

  disconnect: () =>
    apiClient.delete('/outlook/disconnect'),

  getClientThreads: (clientId: string) =>
    apiClient.get<OutlookThread[]>('/outlook/threads', { params: { clientId } }).then(r => r.data.data),

  previewEmail: (documentType: 'invoice' | 'proforma', documentId: string) =>
    apiClient.get<EmailPreview>('/outlook/preview', { params: { documentType, documentId } }).then(r => r.data.data),

  sendEmail: (payload: SendDocumentEmailPayload) =>
    apiClient.post<SendEmailResult>('/outlook/send', payload).then(r => r.data.data),
}
```

### Fichier : `bridge-frontend/src/features/outlook/hooks.ts` (nouveau)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { outlookApi } from './api'
import type { SendDocumentEmailPayload } from './types'

const KEYS = {
  status:  ['outlook', 'status'] as const,
  threads: (clientId: string) => ['outlook', 'threads', clientId] as const,
  preview: (type: string, id: string) => ['outlook', 'preview', type, id] as const,
}

export function useOutlookStatus() {
  return useQuery({
    queryKey: KEYS.status,
    queryFn:  outlookApi.getStatus,
    staleTime: 5 * 60_000,
    retry: false,  // Ne pas retry si non connecté (404 attendu)
  })
}

export function useOutlookConnect() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await outlookApi.getAuthUrl()
      window.open(url, '_blank', 'width=600,height=700,popup=true')
    },
    onError: () => toast.error('Impossible de lancer la connexion Microsoft'),
  })
}

export function useOutlookDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: outlookApi.disconnect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.status })
      toast.success('Compte Outlook déconnecté')
    },
    onError: () => toast.error('Erreur lors de la déconnexion'),
  })
}

export function useClientThreads(clientId: string | undefined) {
  return useQuery({
    queryKey: KEYS.threads(clientId ?? ''),
    queryFn:  () => outlookApi.getClientThreads(clientId!),
    enabled:  !!clientId,
    staleTime: 2 * 60_000,
  })
}

export function useEmailPreview(documentType: 'invoice' | 'proforma', documentId: string | undefined) {
  return useQuery({
    queryKey: KEYS.preview(documentType, documentId ?? ''),
    queryFn:  () => outlookApi.previewEmail(documentType, documentId!),
    enabled:  !!documentId,
    staleTime: 60_000,
  })
}

export function useSendDocumentEmail() {
  return useMutation({
    mutationFn: (p: SendDocumentEmailPayload) => outlookApi.sendEmail(p),
    onSuccess: (result) => {
      if (result.fallback) {
        toast.success('Email envoyé via le serveur BTS (compte Outlook non connecté)')
      } else if (result.outlookUrl) {
        // Ouvrir Outlook — le toast sera affiché par le composant parent
      } else {
        toast.success('Email envoyé depuis votre compte Outlook')
      }
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  })
}
```

---

## 8. FRONTEND — Composant `SendEmailDrawer.tsx`

### Fichier : `bridge-frontend/src/features/outlook/components/SendEmailDrawer.tsx` (nouveau)

Drawer slide-in depuis la droite — même pattern que `PaymentDrawer` et `ProductDrawer`. Lire ces deux fichiers avant d'implémenter pour respecter exactement le pattern existant.

**Props :**
```typescript
interface SendEmailDrawerProps {
  documentType: 'invoice' | 'proforma'
  documentId:   string
  clientId:     string
  onClose:      () => void
}
```

**Structure du drawer :**

**Header (fixe)** :
- Gradient stripe navy→primary 3px en haut
- Icône `Mail` dans un carré arrondi `--primary-light`
- Titre : "Envoyer par email"
- Sous-titre : numéro du document (chargé depuis l'API preview)
- Badge : si Outlook connecté → `✓ Via votre Outlook (armelle@bts.cm)` en vert, sinon `Via serveur BTS` en gris
- Bouton fermer ×

**Corps (scrollable)** :

**Bloc 1 — Destinataire**
```
À :   [input email — pré-rempli depuis le client]
CC :  [chips input — permet d'ajouter plusieurs adresses]
```

**Bloc 2 — Objet**
```
Objet : [input texte — pré-rempli]
```

**Bloc 3 — Répondre à un fil (visible seulement si Outlook connecté)**
```
┌──────────────────────────────────────────────────────┐
│ Mode d'envoi                                         │
│  ○ Nouveau fil de discussion                         │
│  ● Répondre à une conversation existante             │
│                                                      │
│  [Chargement des conversations récentes...]          │
│  ou liste des threads :                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ ○ "Offre réseau Q2 2026"    il y a 2 jours    │  │
│  │ ○ "Réunion technique mars"  il y a 3 semaines  │  │
│  │ ○ "Contrat maintenance"     il y a 2 mois      │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Bloc 4 — Corps du message**
- Utilise `MiniRichEditor` (composant existant dans `src/components/ui/MiniRichEditor.tsx`)
- Pré-rempli avec `buildInvoiceEmailBody` / `buildProformaEmailBody`
- Note en bas : `💡 Votre signature Outlook sera ajoutée automatiquement`

**Bloc 5 — Pièce jointe**
```
📎  Facture-FAC-2026-047.pdf   (généré automatiquement)
```

**Footer (fixe)** :
- Bouton secondaire : **Annuler**
- Bouton **Ouvrir dans Outlook** (outline bleu) — crée brouillon + ouvre onglet Outlook
- Bouton principal **Envoyer directement** (fond bleu) — envoie via API sans ouvrir Outlook
- Si Outlook non connecté : seulement le bouton **Envoyer via BTS** (gris)
- Spinner + disabled pendant mutation

**Comportement "Ouvrir dans Outlook" :**
1. Mutation `useSendDocumentEmail` avec `openInOutlook: true`
2. Reçoit `{ outlookUrl: 'https://outlook.office.com/...' }`
3. `window.open(outlookUrl, '_blank')` → onglet Outlook s'ouvre avec le brouillon prêt
4. Toast : `"Brouillon créé dans Outlook — relisez et envoyez depuis là-bas"`
5. Drawer se ferme

**Comportement "Envoyer directement" :**
1. Mutation avec `openInOutlook: false`
2. Toast succès
3. Drawer se ferme

---

## 9. FRONTEND — Section Outlook dans la page Profil

### Fichier : `bridge-frontend/src/app/(dashboard)/profile/page.tsx`

**Lire le fichier en entier (843 lignes) avant modification.** La page profil a des sections existantes (Informations, Mot de passe, 2FA, Sessions, Notifications). Ajouter une nouvelle section **"Intégrations"** après les sections existantes — ne rien modifier dans les sections actuelles.

**Nouvelle section à ajouter :**

```tsx
{/* ── Section Intégrations ──────────────────────────────── */}
<section aria-labelledby="integrations-title">
  <h2 id="integrations-title" style={{ fontSize: 17, fontWeight: 700, ... }}>
    Intégrations
  </h2>

  {/* Carte Microsoft Outlook */}
  <div className="card" style={{ padding: '20px 24px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Logo Microsoft Outlook SVG ou icône Mail */}
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0078d4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mail size={22} style={{ color: '#fff' }} />
        </div>
        <div>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Microsoft Outlook
          </p>
          {outlookStatus?.connected ? (
            <p style={{ fontSize: 12.5, color: '#16a34a', margin: '2px 0 0' }}>
              ✓ Connecté — {outlookStatus.email}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
              Non connecté — les documents seront envoyés via le serveur BTS
            </p>
          )}
        </div>
      </div>

      {outlookStatus?.connected ? (
        <button onClick={disconnect} style={{ /* bouton danger outline */ }}>
          Déconnecter
        </button>
      ) : (
        <button onClick={connect} style={{ /* bouton primary */ }}>
          Connecter mon Outlook
        </button>
      )}
    </div>

    {outlookStatus?.connected && (
      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)' }}>
        <strong>Permissions accordées :</strong> Envoi d'emails, lecture des conversations, création de brouillons
      </div>
    )}
  </div>
</section>
```

**Gérer le paramètre URL de retour OAuth :**
```tsx
// Dans useEffect au chargement de la page
const params = new URLSearchParams(window.location.search)
if (params.get('outlook') === 'connected') {
  toast.success('Compte Outlook connecté avec succès !')
  window.history.replaceState({}, '', '/profile')
  queryClient.invalidateQueries({ queryKey: ['outlook', 'status'] })
}
if (params.get('outlook') === 'error') {
  toast.error('Erreur lors de la connexion Outlook. Veuillez réessayer.')
  window.history.replaceState({}, '', '/profile')
}
```

---

## 10. INTÉGRATION DANS LES MENUS D'ACTIONS EXISTANTS

### Fichier : `bridge-frontend/src/features/invoices/components/InvoiceActionsMenu.tsx`

**Lire le fichier en entier avant modification.** Ajouter l'option "Envoyer par email" dans le menu existant sans toucher aux autres options.

```tsx
// Ajouter dans les items du menu (après "Télécharger PDF")
{ 
  label: 'Envoyer par email', 
  icon: Mail, 
  onClick: () => setSendEmailOpen(true) 
}

// Ajouter le state
const [sendEmailOpen, setSendEmailOpen] = useState(false)

// Ajouter le drawer (après les autres drawers existants)
{sendEmailOpen && (
  <SendEmailDrawer
    documentType="invoice"
    documentId={invoice.id}
    clientId={invoice.clientId}
    onClose={() => setSendEmailOpen(false)}
  />
)}
```

### Fichier : `bridge-frontend/src/features/proformas/components/ProformaActionsMenu.tsx`

**Lire le fichier en entier avant modification.** Même pattern.

---

## 11. ROUTE OAUTH CALLBACK DANS NEXT.JS

### Fichier : `bridge-frontend/src/app/api/auth/outlook/callback/route.ts` (nouveau)

**Note :** Le callback OAuth peut être géré directement par le backend Express (recommandé, car le backend a accès à Prisma et aux tokens). La route Next.js redirige simplement vers le backend.

Alternativement, si le redirect_uri pointe vers le frontend :
```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')  // userId

  if (!code || !state) {
    return NextResponse.redirect(new URL('/profile?outlook=error', req.url))
  }

  // Relayer vers le backend
  const backendUrl = process.env.NEXT_PUBLIC_API_URL
  const response = await fetch(`${backendUrl}/outlook/callback?code=${code}&state=${state}`)
  
  if (!response.ok) {
    return NextResponse.redirect(new URL('/profile?outlook=error', req.url))
  }

  return NextResponse.redirect(new URL('/profile?outlook=connected', req.url))
}
```

**Recommandation** : Pointer le `OUTLOOK_REDIRECT_URI` directement vers le backend Express (`https://api.bts.cm/api/outlook/callback`). Plus simple, moins d'intermédiaires.

---

## 12. FLOW DE CONNEXION PAR UTILISATEUR — Étapes d'implémentation complètes

Cette section décrit le flow complet qu'un employé BTS suit pour connecter **son propre compte Outlook** à BRIDGE. C'est une action optionnelle, individuelle — chaque employé décide s'il veut l'activer ou non. Les autres fonctionnalités (envoi SMTP, notifications, etc.) continuent de fonctionner sans aucune action.

### Pré-requis (fait une seule fois par l'admin IT)

L'admin IT BTS crée une App Azure AD avec les permissions nécessaires (voir section 13 — Configuration Azure). Tous les employés partagent la même App Azure — seul l'admin IT fait cette étape.

### Flow complet — Vue utilisateur

```
PROFIL PAGE
    │
    │  L'employé voit la section "Intégrations" :
    │  ┌─────────────────────────────────────────┐
    │  │ ● Microsoft Outlook                     │
    │  │   Non connecté — documents envoyés      │
    │  │   via le serveur BTS                    │
    │  │                    [Connecter mon Outlook] │
    │  └─────────────────────────────────────────┘
    │
    ▼
[Clic "Connecter mon Outlook"]
    │
    ├─ Frontend appelle GET /api/outlook/auth-url
    ├─ Backend génère l'URL OAuth Microsoft avec state=userId
    ├─ Frontend ouvre l'URL dans une popup (600×700)
    │
    ▼
POPUP MICROSOFT
    │  L'employé se connecte avec son compte @bts.cm
    │  Microsoft affiche la liste des permissions :
    │  ✓ Lire vos emails
    │  ✓ Envoyer des emails en votre nom
    │  ✓ Créer des brouillons
    │  [Accepter]
    │
    ▼
REDIRECT VERS BACKEND
    │  Microsoft redirige vers :
    │  https://api.bts.cm/api/outlook/callback?code=xxx&state=userId
    │
    ├─ Backend vérifie que state est un userId valide
    ├─ Backend échange le code contre access_token + refresh_token
    ├─ Backend déchiffre l'email depuis le JWT access_token
    ├─ Backend chiffre les tokens AES-256-GCM avant stockage
    ├─ Backend met à jour User (outlookConnected=true, outlookEmail=...)
    ├─ Backend redirige vers : /profile?outlook=connected
    │
    ▼
PROFIL PAGE (retour)
    │  La popup se ferme ou redirige
    │  La page principale détecte ?outlook=connected
    │  Toast : "Compte Outlook connecté avec succès !"
    │  invalidateQueries(['outlook', 'status'])
    │
    ▼
SECTION INTÉGRATIONS MISE À JOUR
    │  ┌─────────────────────────────────────────┐
    │  │ ● Microsoft Outlook                     │
    │  │   ✓ Connecté — armelle.mbida@bts.cm    │
    │  │                         [Déconnecter]   │
    │  └─────────────────────────────────────────┘
    │
    ▼
UTILISATION
    │  Désormais, sur n'importe quelle facture ou proforma :
    │  Menu actions → "Envoyer par email"
    │  → SendEmailDrawer s'ouvre avec badge "Via votre Outlook"
    │  → Thread picker disponible
    │  → "Envoyer directement" ou "Ouvrir dans Outlook"
```

### Implémentation technique — Étapes détaillées pour le développeur

#### Étape 1 — Génération de l'URL OAuth (Backend)

```
GET /api/outlook/auth-url  (requireAuth)
  ↓
outlook.controller.ts → getAuthUrl()
  ↓
microsoftGraph.ts → getOAuthUrl(userId)
  ↓
Construit l'URL :
  https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize
  ?client_id={CLIENT_ID}
  &response_type=code
  &redirect_uri={OUTLOOK_REDIRECT_URI}
  &scope=Mail.Send Mail.ReadWrite Mail.Read offline_access
  &state={userId}          ← CRITIQUE : identifie quel employé revient
  &response_mode=query
  ↓
Retourne { url: "https://login.microsoftonline.com/..." }
```

**Point critique** : Le paramètre `state` contient le `userId` de l'employé. Microsoft le renvoie intact dans le callback — c'est le seul moyen d'identifier quel employé connecte son compte, car le callback n'est pas authentifié.

#### Étape 2 — Popup OAuth (Frontend)

```typescript
// Dans useOutlookConnect (hooks.ts)
const { url } = await outlookApi.getAuthUrl()
// Ouvrir en popup — pas en onglet, pour garder la page profil ouverte
window.open(url, '_blank', 'width=600,height=700,popup=true')

// La popup se fermera après la redirection vers /profile?outlook=connected
// La page principale doit détecter ce changement via useEffect sur searchParams
```

**Alternative** : Si la popup pose des problèmes (bloqueur de popup), utiliser `window.location.href = url` (redirect pleine page). Dans ce cas, la page profil reçoit `?outlook=connected` après retour.

#### Étape 3 — Callback OAuth (Backend)

```
GET /api/outlook/callback?code=xxx&state=userId  (PAS de authenticate — navigateur anonyme)
  ↓
outlook.controller.ts → handleCallback()
  ↓
1. Valider que state est un UUID valide
2. Vérifier que l'utilisateur existe en BD :
   const user = await prisma.user.findUnique({ where: { id: state } })
   if (!user) → redirect vers /profile?outlook=error
3. Appeler outlookService.handleOAuthCallback(userId, code)
  ↓
exchangeCodeForTokens(code) → POST vers Microsoft token endpoint
  ↓
Réponse Microsoft :
  {
    access_token:  "eyJ...",      // Valable ~1 heure
    refresh_token: "0.AXo...",   // Valable ~90 jours (Microsoft)
    expires_in:    3600,
    token_type:    "Bearer"
  }
  ↓
Extraire l'email depuis le JWT access_token :
  const payload = JSON.parse(atob(access_token.split('.')[1]))
  email = payload.preferred_username  // ex: armelle.mbida@bts.cm
  ↓
Chiffrer les tokens AES-256-GCM et stocker en BD :
  await prisma.user.update({
    where: { id: userId },
    data: {
      outlookConnected:      true,
      outlookEmail:          email,
      outlookAccessToken:    encryptToken(access_token),
      outlookRefreshToken:   encryptToken(refresh_token),
      outlookTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    }
  })
  ↓
Rediriger vers : APP_URL/profile?outlook=connected
```

#### Étape 4 — Rafraîchissement automatique des tokens (Backend)

L'access token Microsoft expire après ~1 heure. Le refresh est transparent pour l'utilisateur :

```
N'importe quel appel nécessitant Graph (getClientThreads, createDraft, sendDirect)
  ↓
getGraphClient(userId)
  ↓
Vérifier outlookTokenExpiresAt :
  Si expiresAt <= now + 1 minute → refreshAccessToken(userId)
    ↓
    POST vers Microsoft token endpoint avec grant_type=refresh_token
    Stocker le nouveau access_token chiffré en BD
    Retourner le nouveau token en clair (pour la requête courante)
    ↓
    Si refresh_token invalide (révoqué par l'utilisateur dans Microsoft) :
      → Mettre outlookConnected=false, effacer les tokens
      → Lancer AppError.unauthorized('Session Outlook expirée. Veuillez reconnecter.')
      → L'utilisateur voit un message dans l'UI lui demandant de reconnecter
  Sinon → décrypter outlookAccessToken et l'utiliser directement
```

#### Étape 5 — Déconnexion (par l'employé)

```
DELETE /api/outlook/disconnect  (requireAuth)
  ↓
outlookService.disconnect(userId)
  ↓
prisma.user.update({
  outlookConnected:      false,
  outlookEmail:          null,
  outlookAccessToken:    null,    ← Effacement immédiat en BD
  outlookRefreshToken:   null,
  outlookTokenExpiresAt: null,
})
  ↓
Note : On NE révoque PAS le token côté Microsoft (pas nécessaire pour la sécurité,
l'employé peut le faire lui-même dans myapps.microsoft.com si besoin).
```

#### Étape 6 — État dans l'UI (Frontend)

```typescript
// useOutlookStatus() — appelé au chargement de la page profil ET
// de chaque drawer SendEmail pour afficher le badge correct

// Après connexion réussie, invalider le cache :
queryClient.invalidateQueries({ queryKey: ['outlook', 'status'] })

// Dans SendEmailDrawer, conditionner l'affichage selon outlookStatus.connected :
// connected=true  → badge vert + thread picker + bouton "Via Outlook"
// connected=false → badge gris + message informatif + bouton "Via serveur BTS"
```

### Cas limites à gérer

| Cas | Comportement attendu |
|-----|---------------------|
| Popup bloquée par le navigateur | Afficher un message "Autorisez les popups pour ce site, puis réessayez" |
| Code OAuth déjà utilisé (double-clic) | Microsoft retourne une erreur → redirect /profile?outlook=error |
| Employé n'a pas de compte @bts.cm | OAuth échoue si `response_type=code` est refusé → redirect /profile?outlook=error |
| Refresh token expiré (>90 jours sans utiliser BRIDGE) | `refreshAccessToken` échoue → déconnexion automatique + toast invitation à reconnecter |
| L'employé révoque l'accès dans myapps.microsoft.com | Prochain appel Graph → 401 Microsoft → déconnexion automatique |
| Deux employés connectent Outlook en même temps | Pas de conflit : `state=userId` isole chaque flux |

---

## 13. CONFIGURATION AZURE — Guide pour l'admin IT BTS

Cette section est documentaire — pas de code à écrire, mais à inclure dans `OUTLOOK_SETUP.md`.

### Étapes pour l'admin IT :

1. Aller sur **portal.azure.com** → Azure Active Directory → App registrations → New registration
2. Nom : `InvoiceHub BRIDGE`
3. Supported account types : `Accounts in this organizational directory only` (Single tenant BTS)
4. Redirect URI : `Web` → `https://api.bts.cm/api/outlook/callback`
5. Après création, noter **Application (client) ID** → `OUTLOOK_CLIENT_ID`
6. **Directory (tenant) ID** → `OUTLOOK_TENANT_ID`
7. Aller dans **Certificates & secrets** → New client secret → noter la valeur → `OUTLOOK_CLIENT_SECRET`
8. Aller dans **API permissions** → Add permission → Microsoft Graph → Delegated :
   - `Mail.Send`
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `offline_access`
9. Cliquer **Grant admin consent** (pour que les employés n'aient pas à approuver individuellement)

Ajouter dans `.env` du backend :
```env
OUTLOOK_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OUTLOOK_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OUTLOOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OUTLOOK_REDIRECT_URI=https://api.bts.cm/api/outlook/callback
TOKEN_ENCRYPTION_KEY=64_caractères_hexadécimaux_aléatoires
```

---

## 13. SÉCURITÉ — Points obligatoires

1. **Chiffrement AES-256-GCM** des `outlookAccessToken` et `outlookRefreshToken` en base — jamais en clair
2. **`TOKEN_ENCRYPTION_KEY`** : 32 bytes aléatoires (64 hex chars), jamais commité dans git
3. **Validation du `state`** dans le callback OAuth : vérifier que `state` correspond à un userId valide dans la BD avant d'échanger le code
4. **Scope minimal** : demander uniquement `Mail.Send Mail.Read Mail.ReadWrite offline_access` — pas de `User.Read.All` ni d'accès admin
5. **Révocation propre** : si le refresh token est invalide (utilisateur a révoqué l'accès dans les paramètres Microsoft), déconnecter automatiquement et notifier l'utilisateur dans l'UI
6. **Isolation** : chaque utilisateur ne peut accéder qu'à sa propre boîte Outlook — jamais à celle d'un autre employé
7. **Audit log** : chaque envoi d'email via Outlook est tracé dans `audit_logs` (action `EMAIL_SENT`) avec le documentId, le destinataire, et si c'était un reply ou un nouveau mail

---

## 14. ORDRE D'IMPLÉMENTATION

### Phase 1 — Backend (2 jours)
1. Lire `env.ts` → ajouter variables Outlook
2. Lire `prisma/schema.prisma` → étendre modèle `User` → synchroniser `invoicehub_schema_v3.sql`
3. Créer `src/lib/microsoftGraph.ts`
4. Créer `src/modules/outlook/` (schema, service, controller, routes)
5. Monter le router dans `app.ts`
6. Lire `invoices.service.ts` → remplacer le code email commenté par notification in-app
7. Lire `proformas.service.ts` → idem
8. `pnpm tsc --noEmit` → EXIT 0

### Phase 2 — Frontend (2 jours)
1. Créer `features/outlook/types.ts` + `api.ts` + `hooks.ts`
2. Créer `features/outlook/components/SendEmailDrawer.tsx`
3. Lire `profile/page.tsx` → ajouter section Intégrations
4. Lire `InvoiceActionsMenu.tsx` → ajouter option "Envoyer par email"
5. Lire `ProformaActionsMenu.tsx` → idem
6. Gérer le callback OAuth URL params dans profile/page.tsx
7. `pnpm build` → EXIT 0

### Phase 3 — Tests et configuration (1 jour)
1. Créer `OUTLOOK_SETUP.md` avec guide Azure pour l'admin IT
2. Tester le flow complet : connexion → envoi nouveau mail → réponse dans fil → ouverture Outlook
3. Tester le fallback SMTP (utilisateur non connecté)
4. Tester la révocation (token expiré → déconnexion propre)

---

## 15. DESIGN — Rappel des tokens CSS à respecter

```css
--primary:       #2D7DD2   /* Boutons principaux */
--surface:       #ffffff   /* Fond des drawers et cartes */
--border:        #e2e8f0   /* Séparateurs */
--text-1:        #0f1923   /* Texte principal */
--text-2:        #3d5166   /* Labels */
--text-3:        #5a7a96   /* Texte tertiaire */
--font-display:  'Sora'    /* Titres, labels */
--font-body:     'DM Sans' /* Corps */
--font-mono:     'JetBrains Mono' /* Adresses email */
--radius-md:     10px
--radius-lg:     14px
```

**Couleur Microsoft Outlook** : `#0078d4` (bleu Microsoft officiel) — utiliser uniquement pour l'icône/logo Outlook dans la section profil. Tous les autres boutons respectent `--primary: #2D7DD2`.

**Drawer** :
- `maxWidth: 520px`
- Gradient stripe : `linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)`, hauteur 3px
- Animation : `translateX(100%) → translateX(0)`, 300ms, `cubic-bezier(0.4, 0, 0.2, 1)`
- Backdrop : `background: rgba(10, 20, 35, 0.45)`, `backdropFilter: blur(2px)`
- Body scroll lock quand ouvert
- ESC ferme le drawer

---

Ce prompt est complet, auto-suffisant et tient compte de toute la logique existante de l'application.
