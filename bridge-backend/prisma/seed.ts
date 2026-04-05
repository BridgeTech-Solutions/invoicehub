/**
 * Seed — données initiales InvoiceHub v2.0 — Bridge Technologies Solutions
 *
 * Contenu :
 *  1. Paramètres entreprise (BTS)
 *  2. Bureau Douala (DC)
 *  3. Taux TVA (19,25%)
 *  4. Utilisateurs (admin + commercial)
 *  5. Catégories produits (4)
 *  6. Produits (10)
 *  7. Clients (4)
 *  8. Email templates (7)
 *
 * Usage :
 *   pnpm prisma:seed
 *   -- ou --
 *   DATABASE_URL="..." npx tsx prisma/seed.ts
 */

import { PrismaClient, NotificationStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── 1. Company Settings ──────────────────────────────────────────────────────

async function seedCompanySettings() {
  const existing = await prisma.companySettings.findFirst();
  if (existing) {
    console.log('  ↩  company_settings déjà présent — ignoré');
    return;
  }
  await prisma.companySettings.create({
    data: {
      companyName:                 'Bridge Technologies Solutions',
      legalForm:                   'SARL',
      taxNumber:                   'M0123456789A',
      rccm:                        'RC/DLA/2020/B/1234',
      address:                     'Rue Joss, Immeuble BTS, 4e étage',
      city:                        'Douala',
      country:                     'Cameroun',
      postalBox:                   'B.P. 5042 Douala',
      phone:                       '+237 233 00 00 00',
      email:                       'contact@bts.cm',
      website:                     'https://www.bts.cm',
      defaultCurrency:             'XAF',
      defaultTaxRate:              19.25,
      companyCode:                 'BTS',
      defaultProformaValidityDays: 30,
      defaultInvoiceDueDays:       30,
      sessionTimeoutMinutes:       60,
      maxLoginAttempts:            5,
      autoReminderDays:            [7, 14, 30],
    },
  });
  console.log('  ✓ company_settings');
}

// ─── 2. Bureau / Agence ───────────────────────────────────────────────────────

async function seedOffice() {
  await prisma.agencyOffice.upsert({
    where:  { code: 'DC' },
    update: {},
    create: {
      code:      'DC',
      name:      'Direction Centrale — Douala',
      city:      'Douala',
      address:   'Rue Joss, Immeuble BTS, 4e étage',
      isDefault: true,
      isActive:  true,
    },
  });
  console.log('  ✓ bureau DC (Douala)');
}

// ─── 3. Taux TVA ──────────────────────────────────────────────────────────────

async function seedTaxRates() {
  const rates = [
    { code: 'TVA_19_25', name: 'TVA 19,25%',  rate: 19.25, isDefault: true  },
    { code: 'EXONERE',   name: 'Exonéré (0%)', rate: 0,     isDefault: false },
  ];
  for (const r of rates) {
    await prisma.taxRate.upsert({
      where:  { code: r.code },
      update: {},
      create: { code: r.code, name: r.name, rate: r.rate, isDefault: r.isDefault },
    });
    console.log(`  ✓ taux TVA ${r.code}`);
  }
}

// ─── 4. Utilisateurs ─────────────────────────────────────────────────────────

async function seedUsers() {
  const users = [
    {
      email:               'admin@bts.cm',
      firstName:           'Administrateur',
      lastName:            'BTS',
      role:                'admin'  as const,
      password:            'Admin@BTS2026!',
      mustChangePassword:  false,
    },
    {
      email:               'commercial@bts.cm',
      firstName:           'Jean-Paul',
      lastName:            'Mbarga',
      role:                'commercial' as const,
      password:            'Commercial@BTS2026!',
      mustChangePassword:  false,
    },
    {
      email:               'employe@bts.cm',
      firstName:           'Marie',
      lastName:            'Ngo',
      role:                'employee' as const,
      password:            'Employe@BTS2026!',
      mustChangePassword:  true,
    },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: {
        email:              u.email,
        firstName:          u.firstName,
        lastName:           u.lastName,
        role:               u.role,
        status:             'active',
        passwordHash,
        mustChangePassword: u.mustChangePassword,
        language:           'fr',
        timezone:           'Africa/Douala',
      },
    });
    console.log(`  ✓ user ${u.email} (${u.role}) — mdp: ${u.password}`);
  }
}

// ─── 5. Catégories Produits ───────────────────────────────────────────────────

async function seedCategories() {
  // Les catégories sont déjà insérées par le schéma SQL (invoicehub_schema_v2.sql).
  // Cette fonction est conservée pour éviter les erreurs si le seed est lancé
  // sur une base vide, mais n'insère rien si les catégories existent déjà.
  console.log('  ↩  catégories déjà présentes via le schéma SQL — ignorées');
}

// ─── 6. Produits ─────────────────────────────────────────────────────────────

async function seedProducts() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@bts.cm' } });
  const tva   = await prisma.taxRate.findUnique({ where: { code: 'TVA_19_25' } });

  // Catégories du schéma SQL (invoicehub_schema_v2.sql)
  const catMateriels    = await prisma.productCategory.findUnique({ where: { name: 'Matériels' } });
  const catInfra        = await prisma.productCategory.findUnique({ where: { name: 'Infrastructure' } });
  const catSecurite     = await prisma.productCategory.findUnique({ where: { name: 'Sécurité' } });
  const catLogiciels    = await prisma.productCategory.findUnique({ where: { name: 'Logiciels' } });
  const catMaintenance  = await prisma.productCategory.findUnique({ where: { name: 'Maintenance' } });
  const catConseil      = await prisma.productCategory.findUnique({ where: { name: 'Conseil / DSI' } });

  const products = [
    // Matériels
    {
      name:        'Serveur Dell PowerEdge R750',
      reference:   'SRV-R750',
      type:        'product' as const,
      unit:        'piece'   as const,
      unitPriceHt: 2_850_000,
      categoryId:  catMateriels?.id ?? null,
      description: '<strong>Serveur rack 2U</strong><ul><li>Intel Xeon Silver 4310 (12 cœurs)</li><li>64 Go RAM DDR4 ECC</li><li>2×960 Go SSD NVMe</li><li>iDRAC9 Enterprise inclus</li></ul>',
    },
    {
      name:        'NAS Synology RS3621XS+',
      reference:   'STG-RS3621',
      type:        'product' as const,
      unit:        'piece'   as const,
      unitPriceHt: 1_980_000,
      categoryId:  catMateriels?.id ?? null,
      description: 'NAS rack 12 baies, Xeon D-1531, 32 Go ECC, iSCSI, Snapshot Replication, 2×10GbE',
    },
    {
      name:        'UPS APC Smart-UPS 3000VA',
      reference:   'UPS-3000',
      type:        'product' as const,
      unit:        'piece'   as const,
      unitPriceHt: 620_000,
      categoryId:  catMateriels?.id ?? null,
      description: 'Onduleur ligne-interactive 3000 VA / 2700 W, autonomie 12 min pleine charge, SNMP',
    },
    // Infrastructure réseau
    {
      name:        'Switch Cisco Catalyst 2960-X 48G',
      reference:   'NET-C2960X',
      type:        'product' as const,
      unit:        'piece'   as const,
      unitPriceHt: 480_000,
      categoryId:  catInfra?.id ?? null,
      description: 'Switch manageable 48 ports GE<ol><li>4 ports SFP+ 10G uplink</li><li>Budget PoE+ 740W</li><li>Gestion VLAN, QoS, OSPF</li></ol>',
    },
    {
      name:        'Câblage réseau catégorie 6A (forfait)',
      reference:   'CAB-CAT6A',
      type:        'product' as const,
      unit:        'forfait' as const,
      unitPriceHt: 750_000,
      categoryId:  catInfra?.id ?? null,
      description: 'Installation complète câblage STP Cat6A, RJ45 blindés, chemins de câbles et baies de brassage inclus',
    },
    // Sécurité
    {
      name:        'Pare-feu Fortinet FortiGate 100F',
      reference:   'SEC-FG100F',
      type:        'product' as const,
      unit:        'piece'   as const,
      unitPriceHt: 1_450_000,
      categoryId:  catSecurite?.id ?? null,
      description: 'UTM 10 Gbps, IPS/IDS, VPN SSL, filtrage URL, antivirus intégré, FortiGuard 1 an inclus',
    },
    // Logiciels
    {
      name:        'Licence Windows Server 2022 Datacenter',
      reference:   'LOG-WS2022-DC',
      type:        'product' as const,
      unit:        'licence' as const,
      unitPriceHt: 990_000,
      categoryId:  catLogiciels?.id ?? null,
      description: 'Licence OEM 16 cœurs, droits virtualisation illimités (Hyper-V)',
    },
    // Maintenance
    {
      name:        'Contrat de maintenance annuel',
      reference:   'SVC-MAINT-AN',
      type:        'service' as const,
      unit:        'forfait' as const,
      unitPriceHt: 600_000,
      categoryId:  catMaintenance?.id ?? null,
      description: 'Maintenance préventive et corrective, support téléphonique 8h-18h, 2 visites préventives/an',
    },
    {
      name:        'Installation et configuration réseau',
      reference:   'SVC-INSTALL-NET',
      type:        'service' as const,
      unit:        'jour'    as const,
      unitPriceHt: 120_000,
      categoryId:  catMaintenance?.id ?? null,
      description: 'Mise en rack, câblage, configuration VLAN, QoS, OSPF et tests de conformité',
    },
    // Conseil / DSI
    {
      name:        'Formation administrateur système',
      reference:   'SVC-FORM-SYS',
      type:        'service' as const,
      unit:        'jour'    as const,
      unitPriceHt: 150_000,
      categoryId:  catConseil?.id ?? null,
      description: 'Formation sur site — administration Windows Server / Linux, virtualisation Hyper-V ou VMware',
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({
      where: { name: p.name },
    });
    if (existing) {
      console.log(`  ↩  produit "${p.name}" déjà présent — ignoré`);
      continue;
    }
    await prisma.product.create({
      data: {
        ...p,
        taxRateId:    tva?.id,
        taxRateValue: 19.25,
        isActive:     true,
        createdById:  admin?.id,
      },
    });
    console.log(`  ✓ produit "${p.name}"`);
  }
}

// ─── 7. Clients ───────────────────────────────────────────────────────────────

async function seedClients() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@bts.cm' } });

  const clients = [
    {
      name:                'CAMTEL',
      type:                'company' as const,
      email:               'dsi@camtel.cm',
      phone:               '+237 222 22 20 00',
      address:             'Avenue Ahmadou Ahidjo',
      city:                'Yaoundé',
      taxNumber:           'M0100000001A',
      rccm:                'RC/YAO/1999/B/0001',
      bankName:            'Afriland First Bank',
      bankAccount:         '10006-00010-00987654321-01',
      defaultPaymentTerms: '30 jours fin de mois',
    },
    {
      name:                'SOCIÉTÉ CAMEROUNAISE DE TÉLÉCOMMUNICATIONS (SCT)',
      type:                'company' as const,
      email:               'direction.si@sct.cm',
      phone:               '+237 233 42 00 00',
      address:             'Boulevard de la Liberté, Immeuble Telecenter, 3e étage',
      city:                'Douala',
      postalBox:           'B.P. 4200',
      taxNumber:           'M0876543210A',
      rccm:                'RC/DLA/2001/B/5412',
      defaultPaymentTerms: '30 jours date facture',
    },
    {
      name:                'MINISTÈRE DES POSTES ET TÉLÉCOMMUNICATIONS',
      type:                'company' as const,
      email:               'dsi@minpostel.gov.cm',
      phone:               '+237 222 23 40 05',
      address:             'Quartier administratif, Immeuble Ministère',
      city:                'Yaoundé',
      taxNumber:           'EXONERE',
      defaultPaymentTerms: '60 jours — bon de commande requis',
    },
    {
      name:                'AFRILAND FIRST BANK',
      type:                'company' as const,
      email:               'informatique@afriland.cm',
      phone:               '+237 222 20 30 00',
      address:             'Place de l\'Indépendance, Tour Afriland',
      city:                'Yaoundé',
      taxNumber:           'M0200000005A',
      rccm:                'RC/YAO/1987/B/0012',
      defaultPaymentTerms: '30 jours date facture',
    },
  ];

  for (const c of clients) {
    const existing = await prisma.client.findFirst({ where: { name: c.name } });
    if (existing) {
      console.log(`  ↩  client "${c.name}" déjà présent — ignoré`);
      continue;
    }
    await prisma.client.create({
      data: { ...c, createdById: admin?.id },
    });
    console.log(`  ✓ client "${c.name}"`);
  }
}

// ─── 8. Email Templates ───────────────────────────────────────────────────────

const EMAIL_TEMPLATES: {
  type:      NotificationStatus;
  name:      string;
  subject:   string;
  bodyHtml:  string;
  variables: string[];
}[] = [
  {
    type:      'invoice_issued',
    name:      'Facture émise',
    subject:   '[{{companyName}}] Votre facture {{invoiceNumber}}',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Veuillez trouver ci-joint votre facture <strong>{{invoiceNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Facture</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{invoiceNumber}}</td></tr>
      <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Montant TTC</td><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;color:#2D7DD2;">{{totalTtc}} XAF</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Échéance</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{dueDate}}</td></tr>
    </table>
    <p>Pour toute question, n'hésitez pas à nous contacter.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{dueDate}}', '{{companyName}}'],
  },
  {
    type:      'payment_registered',
    name:      'Paiement enregistré',
    subject:   '[{{companyName}}] Confirmation de paiement — {{invoiceNumber}}',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">✓ Paiement reçu</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous avons bien reçu votre paiement de <strong>{{amountPaid}} XAF</strong> pour la facture <strong>{{invoiceNumber}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Facture</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{invoiceNumber}}</td></tr>
      <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Montant reçu</td><td style="padding:10px 16px;border:1px solid #e5e7eb;color:#16a34a;font-weight:bold;">{{amountPaid}} XAF</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Solde restant</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{balanceDue}} XAF</td></tr>
    </table>
    <p>Merci pour votre règlement.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{clientName}}', '{{invoiceNumber}}', '{{amountPaid}}', '{{balanceDue}}', '{{companyName}}'],
  },
  {
    type:      'invoice_overdue',
    name:      'Facture en retard',
    subject:   '[{{companyName}}] Rappel de paiement — {{invoiceNumber}}',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">⚠ Rappel de paiement</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous vous rappelons que la facture <strong>{{invoiceNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <p>Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{companyName}}'],
  },
  {
    type:      'proforma_sent',
    name:      'Proforma envoyée',
    subject:   '[{{companyName}}] Votre devis {{proformaNumber}}',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#6366f1;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Devis {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Veuillez trouver ci-joint notre devis <strong>{{proformaNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong>, valable jusqu'au <strong>{{validUntil}}</strong>.</p>
    <p>Pour accepter ce devis, veuillez nous contacter ou répondre à cet email.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{companyName}}'],
  },
  {
    type:      'system',
    name:      'Réinitialisation de mot de passe',
    subject:   '[{{companyName}}] Réinitialisation de votre mot de passe',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Réinitialisation du mot de passe</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{firstName}},</p>
    <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous :</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{resetLink}}" style="background:#2D7DD2;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Réinitialiser mon mot de passe</a>
    </div>
    <p style="color:#6b7280;font-size:13px;">Ce lien expire dans 1 heure.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{resetLink}}', '{{companyName}}'],
  },
  {
    type:      'user_created',
    name:      'Bienvenue (nouvel utilisateur)',
    subject:   '[{{companyName}}] Bienvenue sur InvoiceHub',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Bienvenue sur InvoiceHub !</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{firstName}},</p>
    <p>Votre compte sur la plateforme InvoiceHub de <strong>{{companyName}}</strong> a été créé avec succès.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{loginLink}}" style="background:#2D7DD2;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Accéder à la plateforme</a>
    </div>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{loginLink}}', '{{companyName}}'],
  },
  {
    type:      'reminder_sent',
    name:      'Relance interne',
    subject:   '[InvoiceHub BTS] Relance — {{invoiceNumber}}',
    bodyHtml:  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">⚠ Relance — {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est impayée depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <p>Montant dû : <strong>{{totalTtc}} XAF</strong>.</p>
    <p style="color:#6b7280;font-size:13px;">Ceci est une alerte interne — aucun email n'a été envoyé au client.</p>
  </div>
</div>`,
    variables: ['{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{companyName}}'],
  },
];

async function seedEmailTemplates() {
  for (const tpl of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where:  { type: tpl.type },
      update: {},
      create: {
        type:      tpl.type,
        name:      tpl.name,
        subject:   tpl.subject,
        bodyHtml:  tpl.bodyHtml,
        variables: tpl.variables,
        isActive:  true,
      },
    });
    console.log(`  ✓ email template ${tpl.type}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Démarrage du seed InvoiceHub v2.0 — BTS\n');

  console.log('① Paramètres entreprise…');
  await seedCompanySettings();

  console.log('② Bureau…');
  await seedOffice();

  console.log('③ Taux TVA…');
  await seedTaxRates();

  console.log('④ Utilisateurs…');
  await seedUsers();

  console.log('⑤ Catégories produits…');
  await seedCategories();

  console.log('⑥ Produits…');
  await seedProducts();

  console.log('⑦ Clients…');
  await seedClients();

  console.log('⑧ Email templates…');
  await seedEmailTemplates();

  console.log('\n✅ Seed terminé avec succès !\n');
  console.log('─── Comptes créés ───────────────────────────────');
  console.log('  admin@bts.cm          mdp: Admin@BTS2026!');
  console.log('  commercial@bts.cm     mdp: Commercial@BTS2026!');
  console.log('  employe@bts.cm        mdp: Employe@BTS2026!');
  console.log('─────────────────────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('❌ Seed échoué :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
