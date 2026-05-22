import {
  Landmark, BookCheck, ShieldCheck, Settings,
  CreditCard, Upload, ArrowLeftRight, GitMerge, Zap,
  List, Calendar, BookOpen, PenLine, Link2, BarChart3, Download, FileCheck,
  Shield, Key,
  Building2, MapPin, Percent, Mail, Lock, BellRing, HardDrive,
  Cloud, Webhook, Sliders, GitBranch,
  Warehouse, Package, Tag, BarChart2, AlertTriangle,
  Wallet, ReceiptText, PieChart,
} from 'lucide-react'
import { ROUTES } from '@/lib/constants'

interface OverlayItem {
  label:  string
  href:   string
  icon:   React.ElementType
  roles?: string[]
}

interface OverlaySection {
  title: string
  items: OverlayItem[]
}

export interface OverlayPanel {
  id:       string
  title:    string
  icon:     React.ElementType
  sections: OverlaySection[]
}

export const OVERLAY_PANELS: Record<string, OverlayPanel> = {

  expenses: {
    id: 'expenses', title: 'Dépenses & Frais', icon: Wallet,
    sections: [
      {
        title: 'DÉPENSES',
        items: [
          { label: 'Notes de frais', href: ROUTES.EXPENSES, icon: ReceiptText },
        ],
      },
      {
        title: 'ORGANISATION',
        items: [
          { label: 'Catégories', href: ROUTES.EXPENSE_CATEGORIES, icon: Tag },
          { label: 'Budgets',    href: ROUTES.EXPENSE_BUDGETS,    icon: PieChart },
        ],
      },
    ],
  },

  stock: {
    id: 'stock', title: 'Stock & Produits', icon: Warehouse,
    sections: [
      {
        title: 'CATALOGUE',
        items: [
          { label: 'Produits',   href: ROUTES.PRODUCTS,           icon: Package },
          { label: 'Catégories', href: ROUTES.PRODUCT_CATEGORIES, icon: Tag },
        ],
      },
      {
        title: 'STOCK',
        items: [
          { label: 'Inventaire', href: ROUTES.STOCK,          icon: Warehouse },
          { label: 'Mouvements', href: ROUTES.STOCK_MOVEMENTS, icon: ArrowLeftRight },
          { label: 'Niveaux',    href: ROUTES.STOCK_LEVELS,    icon: BarChart2 },
          { label: 'Alertes',    href: ROUTES.STOCK_ALERTS,    icon: AlertTriangle },
        ],
      },
    ],
  },

  bank: {
    id: 'bank', title: 'Banque', icon: Landmark,
    sections: [
      {
        title: 'COMPTES',
        items: [
          { label: 'Mes comptes bancaires', href: ROUTES.BANK_ACCOUNTS,       icon: CreditCard },
        ],
      },
      {
        title: 'IMPORT',
        items: [
          { label: 'Importer un relevé',    href: ROUTES.BANK_IMPORT,         icon: Upload },
        ],
      },
      {
        title: 'TRANSACTIONS',
        items: [
          { label: 'Transactions',          href: ROUTES.BANK_TRANSACTIONS,   icon: ArrowLeftRight },
        ],
      },
      {
        title: 'RAPPROCHEMENT',
        items: [
          { label: 'Rapprochements',        href: ROUTES.BANK_RECONCILIATIONS, icon: GitMerge },
          { label: 'Règles de matching',    href: ROUTES.BANK_MATCHING_RULES,  icon: Zap },
        ],
      },
    ],
  },

  accounting: {
    id: 'accounting', title: 'Comptabilité', icon: BookCheck,
    sections: [
      {
        title: 'RÉFÉRENTIEL',
        items: [
          { label: 'Plan comptable',    href: ROUTES.ACCOUNTING_CHART,   icon: List },
          { label: 'Périodes fiscales', href: ROUTES.ACCOUNTING_PERIODS, icon: Calendar },
        ],
      },
      {
        title: 'SAISIE',
        items: [
          { label: 'Journaux',  href: ROUTES.ACCOUNTING_JOURNALS, icon: BookOpen },
          { label: 'Écritures', href: ROUTES.ACCOUNTING_ENTRIES,  icon: PenLine },
        ],
      },
      {
        title: 'CLÔTURE',
        items: [
          { label: 'Lettrage', href: ROUTES.ACCOUNTING_LETTERING, icon: Link2 },
        ],
      },
      {
        title: 'ÉTATS FINANCIERS',
        items: [
          { label: 'Balance & Grand livre', href: ROUTES.ACCOUNTING_REPORTS,              icon: BarChart3 },
          { label: 'Export Sage',           href: `${ROUTES.ACCOUNTING_REPORTS}/sage`,    icon: Download },
        ],
      },
      {
        title: 'FISCAL',
        items: [
          { label: 'Déclarations TVA', href: ROUTES.ACCOUNTING_TAX, icon: FileCheck },
        ],
      },
    ],
  },

  roles: {
    id: 'roles', title: 'Rôles & Permissions', icon: ShieldCheck,
    sections: [
      {
        title: 'ACCÈS & DROITS',
        items: [
          { label: 'Gestion des rôles',       href: ROUTES.ROLES,            icon: Shield },
          { label: 'Permissions disponibles', href: ROUTES.ROLES_PERMISSIONS, icon: Key },
        ],
      },
    ],
  },

  settings: {
    id: 'settings', title: 'Paramètres', icon: Settings,
    sections: [
      {
        title: 'ENTREPRISE',
        items: [
          { label: 'Informations générales', href: ROUTES.SETTINGS_COMPANY,        icon: Building2, roles: ['admin'] },
          { label: 'Bureaux',                href: ROUTES.SETTINGS_OFFICES,        icon: MapPin,    roles: ['admin'] },
          { label: 'Taux de TVA',            href: ROUTES.SETTINGS_TAX_RATES,      icon: Percent,   roles: ['admin'] },
        ],
      },
      {
        title: 'DOCUMENTS',
        items: [
          { label: 'Templates email', href: ROUTES.SETTINGS_EMAIL_TEMPLATES, icon: Mail, roles: ['admin'] },
        ],
      },
      {
        title: 'COMPTE & SÉCURITÉ',
        items: [
          { label: 'Sécurité',      href: ROUTES.SETTINGS_SECURITY,      icon: Lock },
          { label: 'Notifications', href: ROUTES.SETTINGS_NOTIFICATIONS,  icon: BellRing },
          { label: 'Sauvegardes',   href: ROUTES.SETTINGS_BACKUPS,        icon: HardDrive, roles: ['admin'] },
        ],
      },
      {
        title: 'INTÉGRATIONS',
        items: [
          { label: 'Microsoft Outlook', href: ROUTES.SETTINGS_OUTLOOK, icon: Mail },
          { label: 'OneDrive',          href: ROUTES.SETTINGS_BACKUPS, icon: Cloud },
        ],
      },
      {
        title: 'AVANCÉ',
        items: [
          { label: 'Webhooks',        href: ROUTES.SETTINGS_WEBHOOKS,       icon: Webhook,   roles: ['admin'] },
          { label: 'Clés API',        href: ROUTES.SETTINGS_API_KEYS,       icon: Key,       roles: ['admin'] },
          { label: 'Champs perso.',   href: ROUTES.SETTINGS_CUSTOM_FIELDS,  icon: Sliders,   roles: ['admin'] },
          { label: 'Règles workflow', href: ROUTES.SETTINGS_WORKFLOW_RULES, icon: GitBranch, roles: ['admin'] },
          { label: 'Whitelist IP',    href: ROUTES.SETTINGS_IP_WHITELIST,   icon: Shield,    roles: ['admin'] },
          { label: 'Exports',         href: ROUTES.SETTINGS_EXPORTS,        icon: Download,  roles: ['admin'] },
        ],
      },
    ],
  },
}
