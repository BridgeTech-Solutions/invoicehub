/**
 * Seed — données initiales InvoiceHub v3.0 — Bridge Technologies Solutions
 *
 * Contenu :
 * 0.  Rôles RBAC (admin + commercial + employee + comptable) avec permissions
 * 1.  Paramètres entreprise (BTS) — champs v3 inclus
 * 2.  Bureau Douala (DC)
 * 3.  Taux TVA (19,25% + exonéré)
 * 4.  Utilisateurs (admin + commercial + employee + comptable)
 * 5.  Catégories produits (7) — lues depuis la BD (insérées par le SQL)
 * 6.  Produits (10) — avec gestion stock pour les produits physiques
 * 7.  Clients (8) — données nettoyées
 * 8.  Comptes bancaires BTS (2 comptes propres)
 * 9.  Catégories de dépenses (8)
 * 10. Périodes fiscales (3 années : N-1 fermé, N et N+1 ouvert)
 * 11. Email templates (12)
 *
 * NB : chart_of_accounts et accounting_journals sont insérés par invoicehub_schema_v3.sql
 *
 * Usage :
 * pnpm prisma:seed
 * -- ou --
 * DATABASE_URL="..." npx tsx prisma/seed.ts
 */

import { PrismaClient, NotificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BANK_PROFILES } from '../src/modules/bank/bank.profiles';

const prisma = new PrismaClient();

// ─── 0. Rôles RBAC ────────────────────────────────────────────────────────────

const ROLES = [
  {
    name:        'admin',
    displayName: 'Administrateur',
    description: 'Accès complet à toutes les fonctionnalités',
    color:       '#DC2626',
    icon:        'shield',
    isSystem:    true,
    permissions: ['*'],
  },
  {
    name:        'commercial',
    displayName: 'Commercial',
    description: 'Gestion des devis, factures, paiements et banque',
    color:       '#2563EB',
    icon:        'briefcase',
    isSystem:    true,
    permissions: [
      'clients:read', 'clients:create', 'clients:update',
      'invoices:read', 'invoices:create', 'invoices:update', 'invoices:cancel',
      'proformas:read', 'proformas:create', 'proformas:update', 'proformas:delete',
      'payments:read', 'payments:create',
      'products:read',
      'suppliers:read',
      'expenses:read',
      'bank:read', 'bank:import-parse', 'bank:import-confirm', 'bank:reconcile',
      'dashboard:read',
      'notifications:read',
      'search:read',
      'reports:read',
    ],
  },
  {
    name:        'employee',
    displayName: 'Employé',
    description: 'Accès en lecture seule + banque basique',
    color:       '#16A34A',
    icon:        'user',
    isSystem:    true,
    permissions: [
      'invoices:read',
      'proformas:read',
      'clients:read',
      'products:read',
      'payments:read',
      'bank:read',
      'dashboard:read',
      'notifications:read',
      'search:read',
    ],
  },
  {
    name:        'comptable',
    displayName: 'Comptable',
    description: 'Accès complet à la comptabilité, banque, dépenses et exports',
    color:       '#9333EA',
    icon:        'calculator',
    isSystem:    true,
    permissions: [
      'invoices:read', 'invoices:create', 'invoices:update',
      'proformas:read',
      'clients:read',
      'payments:read', 'payments:create',
      'suppliers:read',
      'expenses:read', 'expenses:create', 'expenses:update', 'expenses:approve',
      'bank:read', 'bank:import-parse', 'bank:import-confirm', 'bank:reconcile',
      'accounting:read', 'accounting:write', 'accounting:validate',
      'fiscal:read', 'fiscal:write',
      'reports:read', 'reports:export',
      'dashboard:read',
      'notifications:read',
      'search:read',
    ],
  },
];

async function seedRoles(): Promise<Record<string, string>> {
  const roleIds: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where:  { name: r.name },
      update: { permissions: r.permissions, displayName: r.displayName },
      create: r,
    });
    roleIds[r.name] = role.id;
    const permLabel = r.permissions.length === 1 && r.permissions[0] === '*'
      ? 'all'
      : `${r.permissions.length} perms`;
    console.log(`  ✓ rôle ${r.name} (${permLabel})`);
  }
  return roleIds;
}

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
      address:                     'Bonamoussadi',
      city:                        'Douala',
      country:                     'Cameroun',
      postalBox:                   'B.P. 5042 Douala',
      phone:                       '+237 233 00 00 00',
      email:                       'contact@bridgetech-solutions.com',
      website:                     'https://bridgetech-solutions.com',
      defaultCurrency:             'XAF',
      defaultTaxRate:              19.25,
      companyCode:                 'BTS',
      defaultProformaValidityDays: 30,
      defaultInvoiceDueDays:       30,
      sessionTimeoutMinutes:       60,
      maxLoginAttempts:            5,
      require2FA:                  false,
      autoReminderDays:            [7, 14, 30],
      reminderEscalation:          {},
      footerSafeZonePx:            0,
      initialStockAccount:         '1042',
      escompteAccountingAccount:   '673',
      collectedTaxAccount:         '4431',
      deductibleTaxAccount:        '4452',
    },
  });
  console.log('  ✓ company_settings');
}

// ─── 2. Bureau / Agence ───────────────────────────────────────────────────────

async function seedOffice(): Promise<string> {
  const office = await prisma.agencyOffice.upsert({
    where:  { code: 'DC' },
    update: {},
    create: {
      code:      'DC',
      name:      'Direction Centrale — Douala',
      city:      'Douala',
      address:   'Bonamoussadi',
      isDefault: true,
      isActive:  true,
    },
  });
  console.log('  ✓ bureau DC (Douala)');
  return office.id;
}

// ─── 3. Taux TVA ──────────────────────────────────────────────────────────────

async function seedTaxRates(): Promise<Record<string, string>> {
  const rates = [
    {
      code:                  'TVA_19_25',
      name:                  'TVA 19,25%',
      rate:                  19.25,
      isDefault:             true,
      collectedTaxAccount:   '4431',
      deductibleTaxAccount:  '4452',
    },
    {
      code:                  'EXONERE',
      name:                  'Exonéré (0%)',
      rate:                  0,
      isDefault:             false,
      collectedTaxAccount:   null,
      deductibleTaxAccount:  null,
    },
  ];

  const taxRateIds: Record<string, string> = {};
  for (const r of rates) {
    const taxRate = await prisma.taxRate.upsert({
      where:  { code: r.code },
      update: {},
      create: r,
    });
    taxRateIds[r.code] = taxRate.id;
    console.log(`  ✓ taux TVA ${r.code}`);
  }
  return taxRateIds;
}

// ─── 4. Utilisateurs ─────────────────────────────────────────────────────────

async function seedUsers(roleIds: Record<string, string>, officeId: string) {
  const users = [
    {
      email:               'admin@bts.cm',
      firstName:           'Administrateur',
      lastName:            'BTS',
      roleName:            'admin',
      password:            'Admin@BTS2026!',
      mustChangePassword:  false,
      jobTitle:            'Administrateur système',
      department:          'Direction',
    },
    {
      email:               'commercial@bts.cm',
      firstName:           'Jean-Paul',
      lastName:            'Mbarga',
      roleName:            'commercial',
      password:            'Commercial@BTS2026!',
      mustChangePassword:  false,
      jobTitle:            'Responsable commercial',
      department:          'Commercial',
    },
    {
      email:               'employe@bts.cm',
      firstName:           'Marie',
      lastName:            'Ngo',
      roleName:            'employee',
      password:            'Employe@BTS2026!',
      mustChangePassword:  true,
      jobTitle:            'Assistante administrative',
      department:          'Administration',
    },
    {
      email:               'comptable@bts.cm',
      firstName:           'Pierre',
      lastName:            'Owono',
      roleName:            'comptable',
      password:            'Comptable@BTS2026!',
      mustChangePassword:  false,
      jobTitle:            'Responsable comptabilité',
      department:          'Finance',
    },
  ];

  for (const u of users) {
    const roleId = roleIds[u.roleName];
    if (!roleId) throw new Error(`Rôle "${u.roleName}" introuvable — seedRoles() doit être appelé avant`);
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: {
        email:              u.email,
        firstName:          u.firstName,
        lastName:           u.lastName,
        roleId,
        status:             'active',
        passwordHash,
        mustChangePassword: u.mustChangePassword,
        language:           'fr',
        timezone:           'Africa/Douala',
        theme:              'system',
        emailNotifications: true,
        invoiceNotifications: true,
        jobTitle:           u.jobTitle,
        department:         u.department,
        officeId,
      },
    });
    console.log(`  ✓ user ${u.email} (${u.roleName})`);
  }
}

// ─── 5. Catégories Produits ───────────────────────────────────────────────────

async function seedCategories(): Promise<Record<string, string | null>> {
  console.log('  ➜ Chargement des catégories de produits depuis la BD…');
  
  // On récupère toutes les catégories injectées au préalable par le schéma SQL v3
  const categories = await prisma.productCategory.findMany();
  const catIds: Record<string, string | null> = {};

  for (const cat of categories) {
    catIds[cat.name] = cat.id;
  }

  // Sécurité : On vérifie que les catégories requises pour les produits du seed existent
  const required = ['Matériels', 'Infrastructure', 'Sécurité', 'Logiciels', 'Maintenance', 'Conseil / DSI'];
  for (const name of required) {
    if (!catIds[name]) {
      console.warn(`  ⚠ Catégorie "${name}" manquante en BD, initialisation à null.`);
      catIds[name] = null;
    }
  }

  console.log(`  ✓ ${categories.length} catégories chargées.`);
  return catIds;
}

// ─── 6. Produits ─────────────────────────────────────────────────────────────

async function seedProducts(catIds: Record<string, string | null>, taxRateIds: Record<string, string>) {
  const admin  = await prisma.user.findUnique({ where: { email: 'admin@bts.cm' } });
  const tvaId  = taxRateIds['TVA_19_25'];

  const products = [
    // ── Matériels ───────────────────────────────────────────────────────────
    {
      name:           'Serveur Dell PowerEdge R750',
      reference:      'SRV-R750',
      type:           'product' as const,
      unit:           'piece'   as const,
      unitPriceHt:    2_850_000,
      categoryId:     catIds['Matériels'],
      description:    '<strong>Serveur rack 2U</strong><ul><li>Intel Xeon Silver 4310 (12 cœurs)</li><li>64 Go RAM DDR4 ECC</li><li>2×960 Go SSD NVMe</li><li>iDRAC9 Enterprise inclus</li></ul>',
      trackStock:     true,
      stockQuantity:  0,
      stockMinLevel:  1,
      purchasePriceHt: 2_200_000,
    },
    {
      name:           'NAS Synology RS3621XS+',
      reference:      'STG-RS3621',
      type:           'product' as const,
      unit:           'piece'   as const,
      unitPriceHt:    1_980_000,
      categoryId:     catIds['Matériels'],
      description:    'NAS rack 12 baies, Xeon D-1531, 32 Go ECC, iSCSI, Snapshot Replication, 2×10GbE',
      trackStock:     true,
      stockQuantity:  0,
      stockMinLevel:  1,
      purchasePriceHt: 1_500_000,
    },
    {
      name:           'UPS APC Smart-UPS 3000VA',
      reference:      'UPS-3000',
      type:           'product' as const,
      unit:           'piece'   as const,
      unitPriceHt:    620_000,
      categoryId:     catIds['Matériels'],
      description:    'Onduleur ligne-interactive 3000 VA / 2700 W, autonomie 12 min pleine charge, SNMP',
      trackStock:     true,
      stockQuantity:  0,
      stockMinLevel:  2,
      purchasePriceHt: 450_000,
    },
    // ── Infrastructure ──────────────────────────────────────────────────────
    {
      name:           'Switch Cisco Catalyst 2960-X 48G',
      reference:      'NET-C2960X',
      type:           'product' as const,
      unit:           'piece'   as const,
      unitPriceHt:    480_000,
      categoryId:     catIds['Infrastructure'],
      description:    'Switch manageable 48 ports GE<ol><li>4 ports SFP+ 10G uplink</li><li>Budget PoE+ 740W</li><li>Gestion VLAN, QoS, OSPF</li></ol>',
      trackStock:     true,
      stockQuantity:  0,
      stockMinLevel:  1,
      purchasePriceHt: 350_000,
    },
    {
      name:           'Câblage réseau catégorie 6A (forfait)',
      reference:      'CAB-CAT6A',
      type:           'product' as const,
      unit:           'forfait' as const,
      unitPriceHt:    750_000,
      categoryId:     catIds['Infrastructure'],
      description:    'Installation complète câblage STP Cat6A, RJ45 blindés, chemins de câbles et baies de brassage inclus',
      trackStock:     false,
    },
    // ── Sécurité ────────────────────────────────────────────────────────────
    {
      name:           'Pare-feu Fortinet FortiGate 100F',
      reference:      'SEC-FG100F',
      type:           'product' as const,
      unit:           'piece'   as const,
      unitPriceHt:    1_450_000,
      categoryId:     catIds['Sécurité'],
      description:    'UTM 10 Gbps, IPS/IDS, VPN SSL, filtrage URL, antivirus intégré, FortiGuard 1 an inclus',
      trackStock:     true,
      stockQuantity:  0,
      stockMinLevel:  1,
      purchasePriceHt: 1_050_000,
    },
    // ── Logiciels ───────────────────────────────────────────────────────────
    {
      name:           'Licence Windows Server 2022 Datacenter',
      reference:      'LOG-WS2022-DC',
      type:           'product' as const,
      unit:           'licence' as const,
      unitPriceHt:    990_000,
      categoryId:     catIds['Logiciels'],
      description:    'Licence OEM 16 cœurs, droits virtualisation illimités (Hyper-V)',
      trackStock:     false,
    },
    // ── Maintenance ─────────────────────────────────────────────────────────
    {
      name:           'Contrat de maintenance annuel',
      reference:      'SVC-MAINT-AN',
      type:           'service' as const,
      unit:           'forfait' as const,
      unitPriceHt:    600_000,
      categoryId:     catIds['Maintenance'],
      description:    'Maintenance préventive et corrective, support téléphonique 8h-18h, 2 visites préventives/an',
      trackStock:     false,
    },
    {
      name:           'Installation et configuration réseau',
      reference:      'SVC-INSTALL-NET',
      type:           'service' as const,
      unit:           'jour'    as const,
      unitPriceHt:    120_000,
      categoryId:     catIds['Maintenance'],
      description:    'Mise en rack, câblage, configuration VLAN, QoS, OSPF et tests de conformité',
      trackStock:     false,
    },
    // ── Conseil / DSI ───────────────────────────────────────────────────────
    {
      name:           'Formation administrateur système',
      reference:      'SVC-FORM-SYS',
      type:           'service' as const,
      unit:           'jour'    as const,
      unitPriceHt:    150_000,
      categoryId:     catIds['Conseil / DSI'],
      description:    'Formation sur site — administration Windows Server / Linux, virtualisation Hyper-V ou VMware',
      trackStock:     false,
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) {
      console.log(`  ↩  produit "${p.name}" déjà présent — ignoré`);
      continue;
    }
    await prisma.product.create({
      data: {
        name:           p.name,
        reference:      p.reference,
        type:           p.type,
        unit:           p.unit,
        unitPriceHt:    p.unitPriceHt,
        categoryId:     p.categoryId ?? undefined,
        description:    p.description,
        taxRateId:      tvaId,
        taxRateValue:   19.25,
        isActive:       true,
        trackStock:     p.trackStock ?? false,
        stockQuantity:  p.stockQuantity ?? 0,
        stockMinLevel:  p.stockMinLevel ?? undefined,
        purchasePriceHt: (p as any).purchasePriceHt ?? undefined,
        createdById:    admin?.id,
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
      name:      'ACCESS BANK CAMEROON PLC',
      email:     'access@bank.com',
      phone:     '233 509 700',
      address:   'Rue 1178 Boulevard de la Liberté',
      city:      'Douala',
      taxNumber: 'M121914380101E',
      rccm:      'RC/DLA/2019/B/5439',
      postalBox: '6000 Douala',
      country:   'Cameroun',
      type:      'company' as const,
    },
    {
      name:      'BGFIBANK CAMEROUN',
      email:     'achats.cmr@bgfi.com',
      phone:     '33 42 64 64',
      address:   'Avenue de Gaulle, Angle Rue Carras',
      city:      'Douala',
      taxNumber: 'M031000031300H',
      rccm:      'RC/DLA/2009/B/623',
      postalBox: '660 Douala-Cameroun',
      country:   'Cameroun',
      type:      'company' as const,
    },
    {
      name:      'SOCIETE GENERALE CAMEROUN',
      email:     'Bernadette.Emessiene@socgen.com',
      phone:     '33427010',
      address:   '78 rue Joss',
      city:      'Douala',
      taxNumber: 'M026300006400K',
      rccm:      'RC/DLA/1994/B/013.111',
      postalBox: '4042 Douala-Cameroun',
      country:   'Cameroun',
      type:      'company' as const,
    },
    {
      name:      "BEAC (BANQUE DES ETATS DE L'AFRIQUE CENTRALE)",
      email:     'cgam.scx@beac.int',
      phone:     '694865607',
      address:   'Services Centraux',
      city:      'Yaoundé',
      postalBox: 'BP 1917 Yaoundé',
      country:   'Cameroun',
      type:      'company' as const,
    },
    {
      name:  'CNEF',
      email: 'bobe@beac.int',
      city:  'Douala',
      country: 'Cameroun',
      type:  'company' as const,
    },
    {
      name:  'HORUS INVESTMENT CAPITAL',
      email: 'operateur@horus-ic.com',
      city:  'Douala',
      country: 'Cameroun',
      type:  'company' as const,
    },
    {
      name:      'ACE FINANCE',
      email:     'christian.jueya@ace-finances.net',
      phone:     '694695316',
      address:   'Carrefour Ideal',
      city:      'Douala',
      taxNumber: 'M120500024288J',
      postalBox: '5653 Douala',
      country:   'Cameroun',
      type:      'company' as const,
    },
    {
      name:  'ACTIVA ASSURANCE',
      email: 'consultations.dsg.cm@group-activa.com',
      phone: '233 50 13 00',
      city:  'Douala',
      country: 'Cameroun',
      type:  'company' as const,
    },
  ];

  for (const c of clients) {
    const existing = await prisma.client.findFirst({ where: { name: c.name } });
    if (existing) {
      console.log(`  ↩  client "${c.name}" déjà présent — ignoré`);
      continue;
    }
    await prisma.client.create({
      data: {
        name:        c.name,
        email:       c.email,
        phone:       c.phone,
        address:     c.address,
        city:        c.city,
        taxNumber:   c.taxNumber,
        rccm:        c.rccm,
        postalBox:   c.postalBox,
        country:     c.country ?? 'Cameroun',
        type:        c.type,
        status:      'active',
        currency:    'XAF',
        createdById: admin?.id,
      },
    });
    console.log(`  ✓ client "${c.name}"`);
  }
}

// ─── 8. Comptes Bancaires BTS ─────────────────────────────────────────────────

async function seedBankAccounts() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@bts.cm' } });

  const accounts = [
    {
      name:               'Compte Courant BTS — Société Générale',
      accountType:        'checking'    as const,
      bankName:           'Société Générale Cameroun',
      branchName:         'Agence Bonanjo',
      accountNumber:      '10003 00100 06011620382 93',
      currency:           'XAF',
      openingBalance:     0,
      isDefault:          true,
      isActive:           true,
      color:              '#DC2626',
      accountingAccount:  '521100',
      notes:              'Compte principal BTS',
    },
    {
      name:               'Caisse Principale',
      accountType:        'petty_cash'  as const,
      bankName:           'Caisse interne',
      currency:           'XAF',
      openingBalance:     0,
      isDefault:          false,
      isActive:           true,
      color:              '#16A34A',
      accountingAccount:  '571000',
      notes:              'Caisse pour les dépenses courantes en espèces',
    },
  ];

  for (const a of accounts) {
    const existing = await prisma.bankAccount.findFirst({ where: { name: a.name } });
    if (existing) {
      console.log(`  ↩  compte bancaire "${a.name}" déjà présent — ignoré`);
      continue;
    }
    await prisma.bankAccount.create({
      data: {
        ...a,
        openingBalanceDate: new Date(),
        currentBalance:     a.openingBalance,
        createdById:        admin?.id,
      },
    });
    console.log(`  ✓ compte bancaire "${a.name}"`);
  }
}

// ─── 9. Catégories de Dépenses ────────────────────────────────────────────────

async function seedExpenseCategories() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@bts.cm' } });

  const categories = [
    {
      name:                   'Fournitures de bureau',
      description:            'Papeterie, cartouches, consommables bureautiques',
      icon:                   'pencil',
      color:                  '#2563EB',
      sortOrder:              1,
      accountingAccount:      '606100',
      accountingAccountLabel: 'Fournitures de bureau',
    },
    {
      name:                   'Transport et déplacements',
      description:            'Carburant, billets d\'avion, hôtel, taxi',
      icon:                   'car',
      color:                  '#0891B2',
      sortOrder:              2,
      accountingAccount:      '625100',
      accountingAccountLabel: 'Voyages et déplacements',
    },
    {
      name:                   'Télécommunications',
      description:            'Téléphone, internet, forfaits mobiles',
      icon:                   'phone',
      color:                  '#7C3AED',
      sortOrder:              3,
      accountingAccount:      '626100',
      accountingAccountLabel: 'Télécommunications',
    },
    {
      name:                   'Loyer et charges',
      description:            'Loyer des locaux, charges locatives, eau, électricité',
      icon:                   'building',
      color:                  '#D97706',
      sortOrder:              4,
      accountingAccount:      '622100',
      accountingAccountLabel: 'Loyers et charges',
    },
    {
      name:                   'Équipements informatiques',
      description:            'Achat matériel, accessoires, petits équipements IT',
      icon:                   'laptop',
      color:                  '#DC2626',
      sortOrder:              5,
      accountingAccount:      '604200',
      accountingAccountLabel: 'Achats de matières et fournitures',
    },
    {
      name:                   'Formation et développement',
      description:            'Formations, certifications, livres professionnels',
      icon:                   'graduation-cap',
      color:                  '#16A34A',
      sortOrder:              6,
      accountingAccount:      '631100',
      accountingAccountLabel: 'Frais de formation',
    },
    {
      name:                   'Marketing et publicité',
      description:            'Publicité, événements, matériel promotionnel',
      icon:                   'megaphone',
      color:                  '#9333EA',
      sortOrder:              7,
      accountingAccount:      '623100',
      accountingAccountLabel: 'Publicité et marketing',
    },
    {
      name:                   'Frais bancaires et financiers',
      description:            'Commissions bancaires, frais de virement, agios',
      icon:                   'credit-card',
      color:                  '#64748B',
      sortOrder:              8,
      accountingAccount:      '631200',
      accountingAccountLabel: 'Frais bancaires',
    },
  ];

  for (const c of categories) {
    const existing = await prisma.expenseCategory.findUnique({ where: { name: c.name } });
    if (existing) {
      console.log(`  ↩  catégorie dépense "${c.name}" déjà présente — ignorée`);
      continue;
    }
    await prisma.expenseCategory.create({
      data: { ...c, isActive: true, createdById: admin?.id },
    });
    console.log(`  ✓ catégorie dépense "${c.name}"`);
  }
}

// ─── 11. Email Templates ──────────────────────────────────────────────────────

const EMAIL_TEMPLATES: {
  type:      NotificationStatus;
  name:      string;
  subject:   string;
  bodyHtml:  string;
  variables: string[];
}[] = [
  {
    type:     'invoice_issued',
    name:     'Facture émise [interne BTS]',
    subject:  '[{{companyName}}] Facture émise — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture émise : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> vient d'être émise pour le client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Échéance</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{dueDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{invoiceNumber}}', '{{clientName}}', '{{totalTtc}}', '{{dueDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'invoice_overdue',
    name:     'Facture en retard [interne BTS]',
    subject:  '[{{companyName}}] ALERTE — Facture {{invoiceNumber}} en retard ({{daysOverdue}} j)',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture en retard : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:16px;color:#dc2626;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'payment_registered',
    name:     'Paiement enregistré [interne BTS]',
    subject:  '[{{companyName}}] Paiement reçu — {{invoiceNumber}} — {{amountPaid}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement enregistré : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant reçu</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{amountPaid}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Solde restant</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">{{balanceDue}} XAF</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Date de paiement</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{paymentDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{amountPaid}}', '{{balanceDue}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'proforma_sent',
    name:     'Proforma envoyée [interne BTS]',
    subject:  '[{{companyName}}] Proforma envoyée — {{proformaNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma envoyée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été envoyée au client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Valide jusqu'au</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-weight:600;">{{validUntil}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type:     'system',
    name:     'Réinitialisation de mot de passe',
    subject:  '[{{companyName}}] Réinitialisation de votre mot de passe',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Réinitialisation du mot de passe</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>{{companyName}}</strong>. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{resetLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Réinitialiser mon mot de passe →
      </a>
    </div>
    <p style="margin:0 0 20px;padding:14px 16px;background:#f0f7ff;border-left:3px solid #2D7DD2;border-radius:4px;font-size:13px;color:#1e40af;">
      Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
    </p>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{resetLink}}', '{{companyName}}'],
  },
  {
    type:     'user_created',
    name:     'Bienvenue (nouvel utilisateur)',
    subject:  '[{{companyName}}] Bienvenue {{firstName}} — Votre accès InvoiceHub',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Bienvenue sur InvoiceHub !</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Votre compte sur la plateforme <strong>InvoiceHub</strong> de <strong>{{companyName}}</strong> a été créé avec succès. Vous pouvez dès maintenant vous connecter avec vos identifiants.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Rôle</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{roleName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Email</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{userEmail}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{loginLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Accéder à la plateforme →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{userEmail}}', '{{roleName}}', '{{loginLink}}', '{{companyName}}'],
  },
  {
    type:     'reminder_sent',
    name:     'Relance interne [interne BTS]',
    subject:  '[{{companyName}}] Relance niveau {{reminderLevel}} — {{invoiceNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Relance niveau {{reminderLevel}} — {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> reste impayée. Une action de votre part est recommandée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant dû</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;font-size:16px;color:#d97706;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Niveau de relance</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">Niveau {{reminderLevel}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement. Aucun email n'a été envoyé directement au client.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{reminderLevel}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'invoice_paid',
    name:     'Facture soldée [interne BTS]',
    subject:  '[{{companyName}}] Facture {{invoiceNumber}} intégralement soldée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture soldée : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est intégralement réglée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Date de solde</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;">{{paymentDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'invoice_partially_paid',
    name:     'Paiement partiel reçu [interne BTS]',
    subject:  '[{{companyName}}] Paiement partiel — {{invoiceNumber}} — Solde restant {{balanceDue}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement partiel : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement partiel de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>. Il reste <strong>{{balanceDue}} XAF</strong> à percevoir.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC total</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#374151;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Montant reçu</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;font-size:15px;color:#16a34a;">{{amountPaid}} XAF</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Solde restant</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:15px;color:#dc2626;">{{balanceDue}} XAF</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{amountPaid}}', '{{balanceDue}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type:     'proforma_accepted',
    name:     'Proforma acceptée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} acceptée par {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma acceptée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été acceptée par le client <strong>{{clientName}}</strong>. Vous pouvez maintenant convertir ce devis en facture.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type:     'proforma_rejected',
    name:     'Proforma rejetée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} refusée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma refusée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Le client <strong>{{clientName}}</strong> a refusé la proforma <strong>{{proformaNumber}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;color:#dc2626;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Motif</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-style:italic;">{{comment}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{comment}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type:     'proforma_expired',
    name:     'Proforma expirée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} expirée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma expirée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> envoyée au client <strong>{{clientName}}</strong> a expiré sans réponse le <strong>{{validUntil}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Expirée le</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{validUntil}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type:     'approval_requested',
    name:     "Demande d'approbation [interne BTS]",
    subject:  '[{{companyName}}] ACTION REQUISE — Approbation demandée : {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Approbation requise : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{approverName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;"><strong>{{requesterName}}</strong> vous demande d'approuver le document suivant.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Demandé par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{requesterName}}</td>
      </tr>
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;">Montant</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:700;font-size:16px;color:#7c3aed;">{{amount}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;">{{stepName}} ({{currentStep}}/{{totalSteps}})</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir et approuver →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{approverName}}', '{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{amount}}', '{{stepName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type:     'approval_approved',
    name:     'Approbation validée [interne BTS]',
    subject:  '[{{companyName}}] Étape approuvée ({{currentStep}}/{{totalSteps}}) — {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Étape approuvée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">L'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été approuvée par <strong>{{deciderName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape approuvée</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{stepName}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Approuvé par</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Progression</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;color:#16a34a;">{{currentStep}} / {{totalSteps}} étape(s)</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Suivre la demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type:     'approval_rejected',
    name:     'Approbation rejetée [interne BTS]',
    subject:  '[{{companyName}}] Demande rejetée — {{documentType}} {{documentNumber}} par {{deciderName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande rejetée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Votre demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a été rejetée par <strong>{{deciderName}}</strong>. Le document a été remis en brouillon.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Rejeté par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Motif</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#374151;font-style:italic;">{{comment}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/{{documentUrl}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Corriger et soumettre à nouveau →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{deciderName}}', '{{comment}}', '{{documentUrl}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type:     'approval_expired',
    name:     "Demande d'approbation expirée [interne BTS]",
    subject:  '[{{companyName}}] Demande expirée — {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande expirée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a expiré sans réponse de l'approbateur désigné. Veuillez soumettre une nouvelle demande ou contacter votre responsable.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Demandé par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{requesterName}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Soumettre une nouvelle demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type:     'approval_delegated',
    name:     'Approbation déléguée [interne BTS]',
    subject:  '[{{companyName}}] Délégation — {{documentType}} {{documentNumber}} transmis à {{delegateName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande déléguée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">L'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été déléguée par <strong>{{deciderName}}</strong> à <strong>{{delegateName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{stepName}}</td>
      </tr>
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;">Délégué par</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Délégué à</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;color:#7c3aed;">{{delegateName}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Suivre la demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{delegateName}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
];

// ─── 10. Périodes fiscales (année courante + suivante) ─────────────────────────
// NB : chart_of_accounts et accounting_journals sont insérés par invoicehub_schema_v3.sql

async function seedFiscalPeriods() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  for (const year of years) {
    for (let month = 0; month < 12; month++) {
      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0); // dernier jour du mois
      const name  = `${start.toLocaleString('fr-FR', { month: 'long' })} ${year}`;

      const existing = await prisma.fiscalPeriod.findFirst({
        where: { fiscalYear: year, periodType: 'month', startDate: start },
      });
      if (existing) {
        console.log(`  ↩  période ${name} déjà présente`);
        continue;
      }

      // Années passées → closed, année courante → open, future → open
      const status = year < currentYear ? 'closed' : 'open';

      await prisma.fiscalPeriod.create({
        data: { name, fiscalYear: year, periodType: 'month', startDate: start, endDate: end, status: status as any },
      });
      console.log(`  ✓ période ${name} (${status})`);
    }
  }
}

async function seedEmailTemplates() {
  for (const tpl of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where:  { type_locale: { type: tpl.type, locale: 'fr' } },
      update: {},
      create: {
        type:      tpl.type,
        locale:    'fr',
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

// ─── 12. Profils d'import bancaire ───────────────────────────────────────────

async function seedBankImportProfiles(adminId: string) {
  let created = 0;
  let skipped = 0;

  for (const p of BANK_PROFILES) {
    const existing = await prisma.bankImportProfile.findFirst({
      where: { name: p.name, deletedAt: null },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.bankImportProfile.create({
      data: {
        name:               p.name,
        bankName:           p.name,
        country:            p.country ?? 'CM',
        source:             p.source,
        fileFormat:         p.fileFormat,
        encoding:           p.encoding,
        delimiter:          p.delimiter,
        dateFormat:         p.dateFormat,
        numberFormat:       p.numberFormat,
        columnMapping:      p.columns,
        directionValues:    p.directionValues ?? undefined,
        amountSign:         p.amountSign      ?? undefined,
        skipRowsContaining: p.skipRowsContaining ?? undefined,
        skipFirstRows:      p.skipFirstRows   ?? 0,
        isPublic:           true,
        notes:              p.verificationNote ?? null,
        createdById:        adminId,
      },
    });
    created++;
    console.log(`  ✓ profil bancaire : ${p.name}`);
  }

  if (skipped > 0) console.log(`  ↩  ${skipped} profil(s) déjà présent(s) — ignoré(s)`);
}

async function main() {
  console.log('\n🌱 Démarrage du seed InvoiceHub v3.0 — BTS\n');

  console.log('⓪  Rôles RBAC…');
  const roleIds = await seedRoles();

  console.log('①  Paramètres entreprise…');
  await seedCompanySettings();

  console.log('②  Bureau…');
  const officeId = await seedOffice();

  console.log('③  Taux TVA…');
  const taxRateIds = await seedTaxRates();

  console.log('④  Utilisateurs…');
  await seedUsers(roleIds, officeId);

  console.log('⑤  Catégories produits…');
  const catIds = await seedCategories();

  console.log('⑥  Produits…');
  await seedProducts(catIds, taxRateIds);

  console.log('⑦  Clients…');
  await seedClients();

  console.log('⑧  Comptes bancaires…');
  await seedBankAccounts();

  console.log('⑨  Profils d\'import bancaire…');
  const adminUser = await prisma.user.findFirst({ where: { email: 'admin@bts.cm' } });
  if (adminUser) await seedBankImportProfiles(adminUser.id);

  console.log('⑩  Catégories de dépenses…');
  await seedExpenseCategories();

  // NB : chart_of_accounts et accounting_journals sont insérés par invoicehub_schema_v3.sql

  console.log('⑪  Périodes fiscales…');
  await seedFiscalPeriods();

  console.log('⑫  Email templates…');
  await seedEmailTemplates();

  // Vérification plan comptable
  const coaCount = await prisma.chartOfAccount.count();
  if (coaCount === 0) {
    console.log('\n⚠️  ATTENTION : le plan comptable SYSCOHADA est vide !');
    console.log('   Exécutez le script SQL pour l\'initialiser :');
    console.log('   psql -U postgres -d invoicehub -f invoicehub_schema_v3.sql\n');
  } else {
    console.log(`  ✓ plan comptable SYSCOHADA (${coaCount} comptes présents)`);
  }

  console.log('\n✅ Seed terminé avec succès !\n');
  console.log('─── Comptes créés ───────────────────────────────────────');
  console.log('  admin@bts.cm        mdp: Admin@BTS2026!');
  console.log('  commercial@bts.cm   mdp: Commercial@BTS2026!');
  console.log('  employe@bts.cm      mdp: Employe@BTS2026!  (doit changer mdp)');
  console.log('  comptable@bts.cm    mdp: Comptable@BTS2026!');
  console.log('─────────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('❌ Seed échoué :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());