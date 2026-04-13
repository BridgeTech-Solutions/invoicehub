# Module Achats (Purchases) — InvoiceHub v2.0 BTS

> Document de conception complet pour l'implémentation du module achats.  
> Basé sur l'analyse de l'architecture existante : modules invoices, proformas, clients, products, payments, reports, dashboard, jobs.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Entités métier](#2-entités-métier)
3. [Schéma de base de données](#3-schéma-de-base-de-données)
4. [Numérotation SYSCOHADA](#4-numérotation-syscohada)
5. [Cycles de vie](#5-cycles-de-vie)
6. [API REST — Endpoints](#6-api-rest--endpoints)
7. [Logique métier clé](#7-logique-métier-clé)
8. [Intégrations avec les modules existants](#8-intégrations-avec-les-modules-existants)
9. [RBAC et permissions](#9-rbac-et-permissions)
10. [Rapports et KPIs](#10-rapports-et-kpis)
11. [Jobs et notifications](#11-jobs-et-notifications)
12. [Frontend — Pages et composants](#12-frontend--pages-et-composants)
13. [Plan d'implémentation](#13-plan-dimplémentation)

---

## 1. Vue d'ensemble

### Pourquoi ce module ?

BTS achète du matériel hardware auprès de fournisseurs pour le revendre à ses clients. Le cycle complet est :

```
Fournisseur → Bon de commande → Réception → Facture fournisseur → Paiement fournisseur
                                                                          ↓
                                                             Produits en stock
                                                                          ↓
                                                      Client ← Facture vente ← Proforma
```

Sans module achats, BTS ne peut pas :
- Calculer ses **marges** (prix achat vs prix vente)
- Suivre ses **dettes fournisseurs**
- Gérer un **stock simple** (quantité en entrée via réception BC)
- Produire un **bilan achats/ventes** conforme SYSCOHADA

### Périmètre fonctionnel

| Fonctionnalité | Description |
|---|---|
| Fournisseurs | CRUD complet, archivage soft-delete, historique achats |
| Bons de commande | Création, envoi, confirmation, réception partielle/totale |
| Factures fournisseur | Saisie, validation, suivi paiements |
| Paiements fournisseur | Enregistrement, reçu PDF, solde auto |
| Prix d'achat produits | `purchasePriceHt` sur Product, marge auto-calculée |
| Stock simple | Mouvements entrée (réception BC), sortie (vente facture) |
| Rapports | Achats par période, par fournisseur, marges, TVA déductible |
| Dashboard | KPIs achats + marge brute intégrés aux KPIs existants |

---

## 2. Entités métier

### 2.1 Fournisseurs (`suppliers`)

Miroir exact de la table `clients`. Un fournisseur peut aussi être un client (cas BTS — achat et revente).

**Champs principaux :**
```
id, type (company|individual), name, email, phone, address, city, country
taxNumber, rccm, bankName, bankAccount, currency (XAF)
contactName, contactEmail, contactPhone          ← interlocuteur commercial
paymentTerms (net30, net60, immediat, etc.)
isPreferred (fournisseur privilégié)
internalNotes, metadata
status (active|archived), deletedAt (soft-delete)
createdById, createdAt, updatedAt
```

**Relations :**
- `purchaseOrders[]` — bons de commande passés
- `supplierInvoices[]` — factures reçues
- `products[]` — produits liés à ce fournisseur (relation many-to-many via `supplier_products`)

---

### 2.2 Bons de commande fournisseur (`purchase_orders`)

Équivalent du `Proforma` côté achat. BTS envoie un BC à un fournisseur.

**Champs principaux :**
```
id, number (BTS/DC/2026/01/BC001), officeId
supplierId → Supplier
createdById → User, assignedToId → User
issueDate, expectedDeliveryDate, deliveredAt
subject, notes, deliveryAddress
currency (XAF), subtotalHt, globalDiscountType/Value/Amount
totalHt, totalTax, totalTtc
amountReceived (total lignes reçues), balancePending
status (draft|sent|confirmed|partially_received|received|cancelled)
pdfPath, pdfGeneratedAt
metadata, createdAt, updatedAt, deletedAt
```

**Lignes BC (`purchase_order_lines`) :**
```
id, purchaseOrderId, productId (nullable — article libre)
sortOrder, designation, description, unit
quantity, unitPriceHt, discountType/Value/Amount
taxRate, subtotalHt, netHt, taxAmount, totalTtc
quantityReceived (0 par défaut, incrémenté à la réception)
```

---

### 2.3 Factures fournisseur (`supplier_invoices`)

Facture reçue d'un fournisseur, saisie manuellement dans le système.

**Champs principaux :**
```
id, number (numéro BTS interne : BTS/DC/2026/01/FF001)
supplierInvoiceNumber (numéro externe du fournisseur — obligatoire)
supplierId → Supplier
purchaseOrderId → PurchaseOrder (nullable — facture sans BC)
createdById → User
issueDate, dueDate, receivedAt
subject, notes, currency (XAF)
subtotalHt, totalHt, totalTax, totalTtc
amountPaid (auto-calculé), balanceDue (auto-calculé)
status (draft|received|validated|partially_paid|paid|overdue|disputed|cancelled)
pdfPath (scan de la facture originale uploadé), pdfGeneratedAt
metadata, createdAt, updatedAt, deletedAt
```

**Lignes facture fournisseur (`supplier_invoice_lines`) :**
```
id, supplierInvoiceId, productId (nullable)
sortOrder, designation, description, unit
quantity, unitPriceHt, discountType/Value/Amount
taxRate, subtotalHt, netHt, taxAmount, totalTtc
```

---

### 2.4 Paiements fournisseur (`supplier_payments`)

Miroir exact de la table `payments` côté vente.

**Champs principaux :**
```
id, supplierInvoiceId → SupplierInvoice
recordedById → User
amount, currency (XAF)
method (virement|especes|cheque|mobile_money|autre)
reference (numéro virement, chèque, etc.)
paidAt (date effective du paiement)
notes
createdAt, updatedAt, deletedAt (soft-delete)
```

**Règle :** Après chaque paiement, `amountPaid` et `balanceDue` de la facture fournisseur sont recalculés. Le statut passe à `partially_paid` ou `paid` automatiquement.

---

### 2.5 Relation Produit ↔ Fournisseur (`supplier_products`)

Table de liaison many-to-many pour tracker les fournisseurs habituels d'un produit.

```
id, supplierId, productId
supplierReference (référence catalogue fournisseur)
purchasePriceHt (prix d'achat chez CE fournisseur — peut varier)
isPreferred (fournisseur principal pour ce produit)
leadTimeDays (délai de livraison moyen)
lastOrderedAt
createdAt, updatedAt
```

---

### 2.6 Stock simple (`stock_movements`)

Mouvement de stock automatique à la réception d'un BC et à l'émission d'une facture vente.

```
id, productId → Product
type (in|out|adjustment)
quantity (+ entrée, - sortie)
reason (purchase_order|invoice|manual_adjustment)
referenceId (UUID du BC ou de la facture source)
referenceType (purchase_order|invoice)
note
createdById → User
createdAt
```

**Champs sur `Product` à ajouter :**
```
purchasePriceHt   Decimal  @default(0)   ← prix d'achat catalogue
stockQuantity     Decimal  @default(0)   ← stock actuel (recalculable via movements)
stockMinAlert     Int      @default(0)   ← seuil d'alerte rupture
```

---

## 3. Schéma de base de données

### 3.1 Nouveaux enums Prisma

```prisma
enum SupplierType {
  company
  individual
  @@map("supplier_type")
}

enum SupplierStatus {
  active
  archived
  @@map("supplier_status")
}

enum PurchaseOrderStatus {
  draft
  sent
  confirmed
  partially_received
  received
  cancelled
  @@map("purchase_order_status")
}

enum SupplierInvoiceStatus {
  draft
  received
  validated
  partially_paid
  paid
  overdue
  disputed
  cancelled
  @@map("supplier_invoice_status")
}

enum StockMovementType {
  in
  out
  adjustment
  @@map("stock_movement_type")
}

enum StockMovementReason {
  purchase_order
  invoice
  manual_adjustment
  initial_stock
  @@map("stock_movement_reason")
}
```

Aussi : ajouter à l'enum `AuditAction` existant :
```prisma
PURCHASE_ORDER_CONFIRMED
PURCHASE_ORDER_RECEIVED
SUPPLIER_INVOICE_VALIDATED
SUPPLIER_PAYMENT_REGISTERED
SUPPLIER_PAYMENT_DELETED
STOCK_ADJUSTED
```

Et à `NotificationStatus` :
```prisma
purchase_order_confirmed
purchase_order_received
supplier_invoice_due
supplier_payment_registered
stock_low_alert
```

Et à `DocumentType` :
```prisma
purchase_order
supplier_invoice
```

---

### 3.2 Modèles Prisma complets

```prisma
// ================================================================
// FOURNISSEURS
// ================================================================

model Supplier {
  id                String         @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  type              SupplierType   @default(company)
  name              String         @db.VarChar(255)
  email             String?        @db.VarChar(255)
  phone             String?        @db.VarChar(50)
  phone2            String?        @map("phone_2") @db.VarChar(50)
  address           String?
  city              String?        @db.VarChar(100)
  country           String         @default("Cameroun") @db.VarChar(100)
  postalBox         String?        @map("postal_box") @db.VarChar(50)
  taxNumber         String?        @map("tax_number") @db.VarChar(100)
  rccm              String?        @db.VarChar(100)
  bankName          String?        @map("bank_name") @db.VarChar(255)
  bankAccount       String?        @map("bank_account") @db.VarChar(100)
  contactName       String?        @map("contact_name") @db.VarChar(255)
  contactEmail      String?        @map("contact_email") @db.VarChar(255)
  contactPhone      String?        @map("contact_phone") @db.VarChar(50)
  currency          String         @default("XAF") @db.Char(3)
  paymentTerms      String?        @map("payment_terms")
  isPreferred       Boolean        @default(false) @map("is_preferred")
  internalNotes     String?        @map("internal_notes")
  metadata          Json           @default("{}")
  status            SupplierStatus @default(active)
  createdAt         DateTime       @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime       @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt         DateTime?      @map("deleted_at") @db.Timestamptz()
  createdById       String?        @map("created_by") @db.Uuid
  createdBy         User?          @relation(fields: [createdById], references: [id], onDelete: SetNull)

  purchaseOrders    PurchaseOrder[]
  supplierInvoices  SupplierInvoice[]
  supplierProducts  SupplierProduct[]

  @@map("suppliers")
}

// ================================================================
// BONS DE COMMANDE FOURNISSEUR
// ================================================================

model PurchaseOrder {
  id                    String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  number                String              @unique @db.VarChar(50)
  officeId              String              @map("office_id") @db.Uuid
  office                AgencyOffice        @relation(fields: [officeId], references: [id], onDelete: Restrict)
  supplierId            String              @map("supplier_id") @db.Uuid
  supplier              Supplier            @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  createdById           String              @map("created_by") @db.Uuid
  createdBy             User                @relation("PurchaseOrderCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  assignedToId          String?             @map("assigned_to") @db.Uuid
  assignedTo            User?               @relation("PurchaseOrderAssignedTo", fields: [assignedToId], references: [id], onDelete: SetNull)
  issueDate             DateTime            @default(dbgenerated("CURRENT_DATE")) @map("issue_date") @db.Date
  expectedDeliveryDate  DateTime?           @map("expected_delivery_date") @db.Date
  deliveredAt           DateTime?           @map("delivered_at") @db.Timestamptz()
  deliveryAddress       String?             @map("delivery_address")
  subject               String?             @db.VarChar(500)
  notes                 String?
  currency              String              @default("XAF") @db.Char(3)
  subtotalHt            Decimal             @default(0) @map("subtotal_ht") @db.Decimal(15, 2)
  globalDiscountType    DiscountType        @default(none) @map("global_discount_type")
  globalDiscountValue   Decimal             @default(0) @map("global_discount_value") @db.Decimal(15, 2)
  globalDiscountAmount  Decimal             @default(0) @map("global_discount_amount") @db.Decimal(15, 2)
  totalHt               Decimal             @default(0) @map("total_ht") @db.Decimal(15, 2)
  totalTax              Decimal             @default(0) @map("total_tax") @db.Decimal(15, 2)
  totalTtc              Decimal             @default(0) @map("total_ttc") @db.Decimal(15, 2)
  status                PurchaseOrderStatus @default(draft)
  pdfPath               String?             @map("pdf_path") @db.VarChar(500)
  pdfGeneratedAt        DateTime?           @map("pdf_generated_at") @db.Timestamptz()
  metadata              Json                @default("{}")
  createdAt             DateTime            @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt             DateTime            @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt             DateTime?           @map("deleted_at") @db.Timestamptz()

  lines            PurchaseOrderLine[]
  supplierInvoices SupplierInvoice[]
  statusHistory    PurchaseOrderStatusHistory[]

  @@map("purchase_orders")
}

model PurchaseOrderLine {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  purchaseOrderId  String          @map("purchase_order_id") @db.Uuid
  purchaseOrder    PurchaseOrder   @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  productId        String?         @map("product_id") @db.Uuid
  product          Product?        @relation(fields: [productId], references: [id], onDelete: SetNull)
  sortOrder        Int             @default(0) @map("sort_order") @db.SmallInt
  designation      String          @db.VarChar(500)
  description      String?
  unit             ProductUnit     @default(piece)
  quantity         Decimal         @default(1) @db.Decimal(10, 3)
  quantityReceived Decimal         @default(0) @map("quantity_received") @db.Decimal(10, 3)
  unitPriceHt      Decimal         @default(0) @map("unit_price_ht") @db.Decimal(15, 2)
  discountType     DiscountType    @default(none) @map("discount_type")
  discountValue    Decimal         @default(0) @map("discount_value") @db.Decimal(15, 2)
  discountAmount   Decimal         @default(0) @map("discount_amount") @db.Decimal(15, 2)
  taxRate          Decimal         @default(19.25) @map("tax_rate") @db.Decimal(5, 2)
  subtotalHt       Decimal         @default(0) @map("subtotal_ht") @db.Decimal(15, 2)
  netHt            Decimal         @default(0) @map("net_ht") @db.Decimal(15, 2)
  taxAmount        Decimal         @default(0) @map("tax_amount") @db.Decimal(15, 2)
  totalTtc         Decimal         @default(0) @map("total_ttc") @db.Decimal(15, 2)
  createdAt        DateTime        @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime        @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("purchase_order_lines")
}

model PurchaseOrderStatusHistory {
  id              String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  purchaseOrderId String              @map("purchase_order_id") @db.Uuid
  purchaseOrder   PurchaseOrder       @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  changedById     String              @map("changed_by") @db.Uuid
  changedBy       User                @relation(fields: [changedById], references: [id], onDelete: Restrict)
  previousStatus  PurchaseOrderStatus? @map("previous_status")
  newStatus       PurchaseOrderStatus @map("new_status")
  reason          String?
  changedAt       DateTime            @default(now()) @map("changed_at") @db.Timestamptz()

  @@map("purchase_order_status_history")
}

// ================================================================
// FACTURES FOURNISSEUR
// ================================================================

model SupplierInvoice {
  id                     String                @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  number                 String                @unique @db.VarChar(50)
  supplierInvoiceNumber  String                @map("supplier_invoice_number") @db.VarChar(100)
  supplierId             String                @map("supplier_id") @db.Uuid
  supplier               Supplier              @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  purchaseOrderId        String?               @map("purchase_order_id") @db.Uuid
  purchaseOrder          PurchaseOrder?        @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)
  createdById            String                @map("created_by") @db.Uuid
  createdBy              User                  @relation(fields: [createdById], references: [id], onDelete: Restrict)
  issueDate              DateTime              @map("issue_date") @db.Date
  dueDate                DateTime?             @map("due_date") @db.Date
  receivedAt             DateTime              @default(now()) @map("received_at") @db.Timestamptz()
  subject                String?               @db.VarChar(500)
  notes                  String?
  currency               String                @default("XAF") @db.Char(3)
  subtotalHt             Decimal               @default(0) @map("subtotal_ht") @db.Decimal(15, 2)
  globalDiscountType     DiscountType          @default(none) @map("global_discount_type")
  globalDiscountValue    Decimal               @default(0) @map("global_discount_value") @db.Decimal(15, 2)
  globalDiscountAmount   Decimal               @default(0) @map("global_discount_amount") @db.Decimal(15, 2)
  totalHt                Decimal               @default(0) @map("total_ht") @db.Decimal(15, 2)
  totalTax               Decimal               @default(0) @map("total_tax") @db.Decimal(15, 2)
  totalTtc               Decimal               @default(0) @map("total_ttc") @db.Decimal(15, 2)
  amountPaid             Decimal               @default(0) @map("amount_paid") @db.Decimal(15, 2)
  balanceDue             Decimal               @default(0) @map("balance_due") @db.Decimal(15, 2)
  status                 SupplierInvoiceStatus @default(received)
  scanPath               String?               @map("scan_path") @db.VarChar(500)
  metadata               Json                  @default("{}")
  createdAt              DateTime              @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt              DateTime              @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt              DateTime?             @map("deleted_at") @db.Timestamptz()

  lines      SupplierInvoiceLine[]
  payments   SupplierPayment[]

  @@map("supplier_invoices")
}

model SupplierInvoiceLine {
  id                String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  supplierInvoiceId String          @map("supplier_invoice_id") @db.Uuid
  supplierInvoice   SupplierInvoice @relation(fields: [supplierInvoiceId], references: [id], onDelete: Cascade)
  productId         String?         @map("product_id") @db.Uuid
  product           Product?        @relation(fields: [productId], references: [id], onDelete: SetNull)
  sortOrder         Int             @default(0) @map("sort_order") @db.SmallInt
  designation       String          @db.VarChar(500)
  description       String?
  unit              ProductUnit     @default(piece)
  quantity          Decimal         @default(1) @db.Decimal(10, 3)
  unitPriceHt       Decimal         @default(0) @map("unit_price_ht") @db.Decimal(15, 2)
  discountType      DiscountType    @default(none) @map("discount_type")
  discountValue     Decimal         @default(0) @map("discount_value") @db.Decimal(15, 2)
  discountAmount    Decimal         @default(0) @map("discount_amount") @db.Decimal(15, 2)
  taxRate           Decimal         @default(19.25) @map("tax_rate") @db.Decimal(5, 2)
  subtotalHt        Decimal         @default(0) @map("subtotal_ht") @db.Decimal(15, 2)
  netHt             Decimal         @default(0) @map("net_ht") @db.Decimal(15, 2)
  taxAmount         Decimal         @default(0) @map("tax_amount") @db.Decimal(15, 2)
  totalTtc          Decimal         @default(0) @map("total_ttc") @db.Decimal(15, 2)
  createdAt         DateTime        @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime        @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("supplier_invoice_lines")
}

// ================================================================
// PAIEMENTS FOURNISSEUR
// ================================================================

model SupplierPayment {
  id                String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  supplierInvoiceId String          @map("supplier_invoice_id") @db.Uuid
  supplierInvoice   SupplierInvoice @relation(fields: [supplierInvoiceId], references: [id], onDelete: Restrict)
  recordedById      String          @map("recorded_by") @db.Uuid
  recordedBy        User            @relation(fields: [recordedById], references: [id], onDelete: Restrict)
  amount            Decimal         @db.Decimal(15, 2)
  currency          String          @default("XAF") @db.Char(3)
  method            PaymentMethod   @default(virement)
  reference         String?         @db.VarChar(255)
  paidAt            DateTime        @map("paid_at") @db.Timestamptz()
  notes             String?
  createdAt         DateTime        @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime        @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt         DateTime?       @map("deleted_at") @db.Timestamptz()

  @@map("supplier_payments")
}

// ================================================================
// RELATION PRODUIT ↔ FOURNISSEUR
// ================================================================

model SupplierProduct {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  supplierId        String   @map("supplier_id") @db.Uuid
  supplier          Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  productId         String   @map("product_id") @db.Uuid
  product           Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  supplierReference String?  @map("supplier_reference") @db.VarChar(100)
  purchasePriceHt   Decimal  @default(0) @map("purchase_price_ht") @db.Decimal(15, 2)
  isPreferred       Boolean  @default(false) @map("is_preferred")
  leadTimeDays      Int?     @map("lead_time_days") @db.SmallInt
  lastOrderedAt     DateTime? @map("last_ordered_at") @db.Timestamptz()
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  @@unique([supplierId, productId])
  @@map("supplier_products")
}

// ================================================================
// MOUVEMENTS DE STOCK
// ================================================================

model StockMovement {
  id              String               @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  productId       String               @map("product_id") @db.Uuid
  product         Product              @relation(fields: [productId], references: [id], onDelete: Restrict)
  type            StockMovementType
  quantity        Decimal              @db.Decimal(10, 3)
  reason          StockMovementReason
  referenceId     String?              @map("reference_id") @db.Uuid
  referenceType   String?              @map("reference_type") @db.VarChar(50)
  note            String?
  stockBefore     Decimal              @map("stock_before") @db.Decimal(10, 3)
  stockAfter      Decimal              @map("stock_after") @db.Decimal(10, 3)
  createdById     String               @map("created_by") @db.Uuid
  createdBy       User                 @relation(fields: [createdById], references: [id], onDelete: Restrict)
  createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz()

  @@map("stock_movements")
}
```

### 3.3 Modifications sur les modèles existants

**Model `Product` — ajout de champs :**
```prisma
purchasePriceHt   Decimal   @default(0)  @map("purchase_price_ht")  @db.Decimal(15, 2)
stockQuantity     Decimal   @default(0)  @map("stock_quantity")      @db.Decimal(10, 3)
stockMinAlert     Int       @default(0)  @map("stock_min_alert")     @db.SmallInt
trackStock        Boolean   @default(false) @map("track_stock")

// Relations à ajouter
supplierProducts  SupplierProduct[]
purchaseOrderLines PurchaseOrderLine[]
supplierInvoiceLines SupplierInvoiceLine[]
stockMovements    StockMovement[]
```

**Model `AgencyOffice` — ajout des relations :**
```prisma
purchaseOrders    PurchaseOrder[]
```

**Model `User` — ajout des relations :**
```prisma
purchaseOrdersCreated   PurchaseOrder[] @relation("PurchaseOrderCreatedBy")
purchaseOrdersAssigned  PurchaseOrder[] @relation("PurchaseOrderAssignedTo")
purchaseOrderStatusHistory PurchaseOrderStatusHistory[]
supplierInvoices        SupplierInvoice[]
supplierPayments        SupplierPayment[]
stockMovements          StockMovement[]
suppliers               Supplier[]
```

---

## 4. Numérotation SYSCOHADA

Les documents achats suivent le même format que les documents vente, via la fonction PostgreSQL `fn_next_document_number()`. Il faut ajouter les nouveaux types dans l'enum `DocumentType` et la table `document_sequences`.

| Type | Préfixe | Exemple |
|---|---|---|
| Bon de commande | `BC` | `BTS/DC/2026/04/BC001` |
| Facture fournisseur (interne) | `FF` | `BTS/DC/2026/04/FF001` |

**Ajout dans `document_sequences` :**  
Les nouvelles séquences `purchase_order` et `supplier_invoice` seront automatiquement créées au premier appel à `fn_next_document_number()` grâce à l'`INSERT ... ON CONFLICT DO NOTHING` existant dans la fonction.

**Côté service (même pattern qu'`invoices.service.ts`) :**
```typescript
// Dans purchase-orders.service.ts
const number = await generateDocumentNumber('purchase_order', officeId);
// → "BTS/DC/2026/04/BC001"

// Dans supplier-invoices.service.ts  
const number = await generateDocumentNumber('supplier_invoice', officeId);
// → "BTS/DC/2026/04/FF001"
```

---

## 5. Cycles de vie

### 5.1 Bon de commande fournisseur

```
draft ──→ sent ──→ confirmed ──→ partially_received ──→ received
  │         │          │                                    │
  └─────────┴──────────┴────────────────────────────────→ cancelled
```

| Transition | Déclencheur | Action automatique |
|---|---|---|
| `draft → sent` | POST `/purchase-orders/:id/send` | PDF généré, email fournisseur (optionnel), notification |
| `sent → confirmed` | POST `/purchase-orders/:id/confirm` | Notification équipe |
| `confirmed → partially_received` | POST `/purchase-orders/:id/receive` avec réception partielle | Mouvements stock `in`, mise à jour `quantityReceived` |
| `confirmed/partially_received → received` | POST `/purchase-orders/:id/receive` avec tout reçu | Mouvements stock `in`, notification équipe |
| `* → cancelled` | POST `/purchase-orders/:id/cancel` | Uniquement si `draft` ou `sent` |

### 5.2 Facture fournisseur

```
received → validated → partially_paid → paid
    │            │                        │
    └────────────┴────────────────→ cancelled / disputed
                                    (si litige)
                            overdue (job cron si échéance dépassée)
```

| Transition | Déclencheur | Action automatique |
|---|---|---|
| `received → validated` | POST `/supplier-invoices/:id/validate` | Notification admin, ajout au registre comptable |
| `validated → partially_paid` | POST `/supplier-invoices/:id/payments` | Recalcul `amountPaid` + `balanceDue` |
| `partially_paid → paid` | Automatique quand `balanceDue = 0` | Notification équipe |
| `* → overdue` | Job cron 00:05 UTC | Notification admin |
| `* → disputed` | POST `/supplier-invoices/:id/dispute` | Note obligatoire, notification admin |

### 5.3 Stock (mouvement automatique)

| Événement | Type mouvement | Déclencheur |
|---|---|---|
| Réception BC (partielle ou totale) | `in` | `receive` sur PurchaseOrder |
| Émission facture vente (futur) | `out` | `issue` sur Invoice (si `trackStock=true`) |
| Ajustement manuel | `adjustment` | POST `/products/:id/stock-adjustment` |

---

## 6. API REST — Endpoints

### Fournisseurs

```
GET    /suppliers                    — liste paginée + filtres
POST   /suppliers                    — créer un fournisseur
GET    /suppliers/:id                — détail
PUT    /suppliers/:id                — modifier
DELETE /suppliers/:id                — archiver (soft-delete)
GET    /suppliers/:id/purchase-orders  — historique BC
GET    /suppliers/:id/invoices         — historique factures
GET    /suppliers/:id/balance          — solde dû (dette totale)
POST   /suppliers/import              — import Excel (admin/commercial)
GET    /suppliers/export?format=csv   — export CSV
```

### Bons de commande

```
GET    /purchase-orders                    — liste paginée
POST   /purchase-orders                    — créer (draft)
GET    /purchase-orders/counts             — compteurs par statut
GET    /purchase-orders/:id                — détail avec lignes
PUT    /purchase-orders/:id                — modifier (si draft)
DELETE /purchase-orders/:id                — soft-delete (si draft)
POST   /purchase-orders/:id/send           — envoyer au fournisseur
POST   /purchase-orders/:id/confirm        — confirmer réception
POST   /purchase-orders/:id/receive        — enregistrer réception (partielle ou totale)
POST   /purchase-orders/:id/cancel         — annuler
POST   /purchase-orders/:id/duplicate      — dupliquer
GET    /purchase-orders/:id/pdf            — générer/télécharger PDF
GET    /purchase-orders/export?format=csv  — export CSV
```

**Body de réception (`/receive`) :**
```typescript
{
  lines: Array<{
    lineId: string;
    quantityReceived: number;  // peut être < quantity (réception partielle)
  }>;
  note?: string;
  deliveredAt?: string; // ISO date, défaut: now()
}
```

### Factures fournisseur

```
GET    /supplier-invoices                    — liste paginée
POST   /supplier-invoices                    — saisir une facture reçue
GET    /supplier-invoices/counts             — compteurs par statut
GET    /supplier-invoices/:id                — détail avec lignes + paiements
PUT    /supplier-invoices/:id                — modifier (si received/draft)
DELETE /supplier-invoices/:id                — soft-delete
POST   /supplier-invoices/:id/validate       — valider
POST   /supplier-invoices/:id/dispute        — mettre en litige
POST   /supplier-invoices/:id/cancel         — annuler
POST   /supplier-invoices/:id/payments       — enregistrer un paiement
DELETE /supplier-invoices/:id/payments/:pid  — supprimer paiement
GET    /supplier-invoices/:id/pdf            — reçu paiement PDF
GET    /supplier-invoices/export?format=csv  — export CSV
```

### Stock

```
GET    /products/:id/stock            — stock actuel + mouvements
POST   /products/:id/stock-adjustment — ajustement manuel (admin seulement)
GET    /products/low-stock            — liste produits en dessous du seuil
```

---

## 7. Logique métier clé

### 7.1 Calcul de marge

La marge est calculée à partir du `purchasePriceHt` du produit et du `unitPriceHt` de vente.

```typescript
// Marge brute par produit
const marginAmount = unitPriceHt - purchasePriceHt;
const marginRate   = purchasePriceHt > 0
  ? ((unitPriceHt - purchasePriceHt) / unitPriceHt) * 100
  : null;

// Marge brute sur une facture
// → Somme pour chaque ligne : (unitPriceHt - purchasePriceHt) * quantity
```

**Règle :** Le `purchasePriceHt` sur le `Product` est le prix catalogue (dernier prix d'achat connu). Le `SupplierProduct.purchasePriceHt` stocke le prix spécifique par fournisseur.

### 7.2 Mise à jour stock à la réception

```typescript
// purchase-orders.service.ts → receive()
// Pour chaque ligne reçue, dans une transaction Prisma :

await prisma.$transaction(async (tx) => {
  for (const line of receivedLines) {
    if (!line.productId || !product.trackStock) continue;

    const product = await tx.product.findFirst({ where: { id: line.productId } });
    const stockBefore = Number(product.stockQuantity);
    const stockAfter  = stockBefore + line.quantityReceived;

    // Mettre à jour le stock
    await tx.product.update({
      where: { id: line.productId },
      data: { stockQuantity: stockAfter },
    });

    // Tracer le mouvement
    await tx.stockMovement.create({
      data: {
        productId: line.productId,
        type: 'in',
        quantity: line.quantityReceived,
        reason: 'purchase_order',
        referenceId: purchaseOrder.id,
        referenceType: 'purchase_order',
        stockBefore, stockAfter,
        createdById: userId,
      },
    });

    // Mettre à jour le prix d'achat du produit (dernier prix reçu)
    await tx.product.update({
      where: { id: line.productId },
      data: { purchasePriceHt: line.unitPriceHt },
    });
  }
});
```

### 7.3 Recalcul solde facture fournisseur

Identique au pattern `payments.service.ts` existant :

```typescript
// Après création ou suppression d'un paiement fournisseur
const payments = await tx.supplierPayment.findMany({
  where: { supplierInvoiceId, deletedAt: null },
});
const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
const balanceDue = Number(invoice.totalTtc) - amountPaid;
const status: SupplierInvoiceStatus =
  balanceDue <= 0 ? 'paid' :
  amountPaid > 0  ? 'partially_paid' :
  invoice.status; // ne pas rétrograder si overdue/disputed

await tx.supplierInvoice.update({
  where: { id: supplierInvoiceId },
  data: { amountPaid, balanceDue, status },
});
```

### 7.4 Alerte stock bas

Dans le job `overdue.processor.ts` (déjà existant), ajouter la vérification du stock :

```typescript
// Produits en dessous du seuil d'alerte
const lowStockProducts = await prisma.product.findMany({
  where: {
    deletedAt: null,
    trackStock: true,
    stockMinAlert: { gt: 0 },
    stockQuantity: { lte: prisma.product.fields.stockMinAlert }, // lte stockMinAlert
  },
});
// → Envoyer notification "stock_low_alert" si pas déjà envoyée aujourd'hui
```

---

## 8. Intégrations avec les modules existants

### 8.1 Products

- Ajout de `purchasePriceHt`, `stockQuantity`, `stockMinAlert`, `trackStock`
- Le formulaire produit (`ProductForm`) affiche maintenant un onglet **"Achats & Stock"**
- La liste produits affiche le stock actuel et un badge d'alerte rouge si `stockQuantity <= stockMinAlert`
- `lineDefaults()` inclut `purchasePriceHt` dans la réponse pour afficher la marge dans le formulaire facture

### 8.2 Reports (`reports.service.ts`)

Nouveaux rapports à ajouter :

```typescript
// Rapport achats par période
async getPurchases(input: DateRangeInput)
// → SUM(totalHt) par mois depuis supplier_invoices

// Rapport achats par fournisseur
async getPurchasesBySupplier(input: DateRangeInput)
// → TOP fournisseurs, montant total, solde dû

// Rapport marges par produit/catégorie
async getMargins(input: DateRangeInput)
// → JOIN invoice_lines + products → (unitPriceHt - purchasePriceHt) * quantity

// Rapport TVA déductible (TVA sur achats)
async getPurchaseTaxSummary(input: DateRangeInput)
// → SUM(totalTax) par trimestre depuis supplier_invoice_lines
```

### 8.3 Dashboard (`dashboard.service.ts`)

Nouveaux KPIs à intégrer dans le cache Redis existant :

```typescript
// Ajout dans getKpis()
const [
  totalPurchasesMonth,   // Total achats HT du mois
  totalPendingPayables,  // Total dettes fournisseurs (balanceDue)
  grossMarginMonth,      // Marge brute du mois (CA - Achats)
  lowStockCount,         // Nombre de produits en rupture/alerte
] = await Promise.all([...]);
```

**Widget supplémentaire sur le dashboard :**
- Carte "Achats du mois" (vs mois précédent)
- Carte "Dettes fournisseurs" (avec badge d'alerte si > seuil)
- Carte "Marge brute" avec sparkline
- Widget "Stock critique" (liste produits à réapprovisionner)

### 8.4 Audit Logs

Chaque action significative est loggée via `auditMiddleware` existant :
- Création/modification BC
- Réception BC (avec détail des quantités)
- Paiement fournisseur
- Ajustement stock manuel

### 8.5 Notifications

| Événement | Destinataires | Canal |
|---|---|---|
| BC confirmé par fournisseur | Admin + Commercial assigné | in_app + email |
| BC reçu (livraison) | Admin + Commercial assigné | in_app |
| Facture fournisseur à échéance J-3 | Admin | in_app + email |
| Facture fournisseur en retard | Admin | in_app + email |
| Stock bas (seuil atteint) | Admin | in_app + email |
| Paiement fournisseur enregistré | Admin | in_app |

### 8.6 Global Search (`search.routes.ts`)

Le moteur de recherche global doit indexer :
- Fournisseurs (nom, email, taxNumber)
- Bons de commande (numéro, sujet, fournisseur)
- Factures fournisseur (numéro, numéro fournisseur, sujet)

---

## 9. RBAC et permissions

| Action | admin | commercial | employee |
|---|---|---|---|
| Voir fournisseurs | ✅ | ✅ | ✅ |
| Créer/modifier fournisseur | ✅ | ✅ | ❌ |
| Archiver fournisseur | ✅ | ❌ | ❌ |
| Créer BC | ✅ | ✅ | ❌ |
| Modifier BC (draft) | ✅ | ✅ | ❌ |
| Envoyer/Confirmer BC | ✅ | ✅ | ❌ |
| Réceptionner BC | ✅ | ✅ | ✅ |
| Annuler BC | ✅ | ❌ | ❌ |
| Créer/valider facture fournisseur | ✅ | ✅ | ❌ |
| Enregistrer paiement fournisseur | ✅ | ✅ | ❌ |
| Supprimer paiement fournisseur | ✅ | ❌ | ❌ |
| Ajustement stock manuel | ✅ | ❌ | ❌ |
| Voir rapports achats/marges | ✅ | ✅ | ❌ |
| Importer fournisseurs | ✅ | ✅ | ❌ |

---

## 10. Rapports et KPIs

### Page Rapports — nouvel onglet "Achats"

```
Onglets existants: Chiffre d'affaires | Par client | Par catégorie | Impayés | TVA
Nouvel onglet:     Achats & Marges
```

**Contenu de l'onglet Achats & Marges :**

1. **Évolution achats/ventes** — graphique barres groupées
   - Barre bleue : CA HT par mois
   - Barre orange : Achats HT par mois
   - Ligne verte : Marge brute (%)

2. **Top fournisseurs** — tableau
   - Fournisseur | Montant acheté | Nb factures | Solde dû | Dernier achat

3. **Marges par catégorie** — graphique camembert ou barres horizontales
   - Catégorie | CA HT | Coût achats | Marge % 

4. **TVA déductible** — tableau par trimestre
   - TVA facturée (ventes) | TVA déductible (achats) | TVA nette à payer

5. **Export** — CSV / PDF du rapport

---

## 11. Jobs et notifications

### Modifications de `overdue.processor.ts`

Ajouter dans le cron 00:05 UTC :

```typescript
// 1. Marquer factures fournisseur en retard
await prisma.supplierInvoice.updateMany({
  where: {
    deletedAt: null,
    status: { in: ['validated', 'partially_paid'] },
    dueDate: { lt: now },
  },
  data: { status: 'overdue' },
});

// 2. Alertes stock bas (1 notif/jour max par produit)
const lowStockProducts = await prisma.product.findMany({
  where: {
    deletedAt: null, trackStock: true,
    stockMinAlert: { gt: 0 },
  },
});
for (const p of lowStockProducts) {
  if (Number(p.stockQuantity) <= p.stockMinAlert) {
    // Enqueue notification stock_low_alert
  }
}
```

### Nouveau cron `purchase-reminder` (00:20 UTC)

```typescript
// Rappels factures fournisseur à échéance dans 3 jours
const upcoming = await prisma.supplierInvoice.findMany({
  where: {
    deletedAt: null,
    status: { in: ['validated', 'partially_paid'] },
    dueDate: {
      gte: addDays(now, 2),
      lte: addDays(now, 4),
    },
  },
});
// → Notification + email admin
```

---

## 12. Frontend — Pages et composants

### 12.1 Structure des routes

```
/purchases
├── /suppliers                    — liste fournisseurs
│   ├── /new                      — créer fournisseur
│   └── /[id]                     — détail fournisseur (onglets: Info | BC | Factures | Solde)
├── /purchase-orders              — liste bons de commande
│   ├── /new                      — créer BC
│   └── /[id]                     — détail BC + réception
├── /supplier-invoices            — liste factures fournisseur
│   ├── /new                      — saisir facture
│   └── /[id]                     — détail + paiements
└── /stock                        — vue stock
    └── /[productId]              — historique mouvements
```

### 12.2 Sidebar

Ajouter une section **"Achats"** dans la sidebar (entre "Produits" et "Rapports") :

```
Achats
├── 🏭 Fournisseurs
├── 📋 Bons de commande
├── 📄 Factures fournisseurs
└── 📦 Stock
```

### 12.3 Composants clés

**`SupplierForm`** — miroir de `ClientForm` :
- Informations générales (nom, type, pays, ville)
- Coordonnées (email, phone, adresse)
- Informations légales (RCCM, numéro contribuable)
- Coordonnées bancaires (banque, numéro compte)
- Contact principal (nom, email, phone)
- Conditions de paiement

**`PurchaseOrderForm`** — miroir de `ProformaForm` :
- En-tête : fournisseur (autocomplete), date, date livraison prévue, bureau
- `LineItemsEditor` réutilisé — même composant que proforma/facture, avec `purchasePriceHt` pré-rempli
- Pied : total HT / TVA / TTC
- Actions : Sauvegarder brouillon | Envoyer | Confirmer

**`ReceiveOrderModal`** — modal de réception de BC :
- Tableau des lignes avec `quantité commandée` / `déjà reçue` / `à recevoir`
- Input quantité reçue pour chaque ligne
- Champ date de livraison réelle
- Champ note

**`SupplierInvoiceForm`** :
- Sélecteur de fournisseur
- Lien optionnel vers un BC existant (autocomplete)
- Numéro de facture fournisseur (obligatoire)
- Date émission / date échéance
- `LineItemsEditor` réutilisé
- Upload scan facture (PDF/image)

**`SupplierPaymentModal`** — miroir de `PaymentModal` :
- Montant, méthode, référence, date

**`StockBadge`** — composant inline pour afficher le stock :
```tsx
// vert si stockQuantity > stockMinAlert
// orange si stockQuantity <= stockMinAlert && > 0
// rouge si stockQuantity <= 0
<StockBadge quantity={30} minAlert={10} />  // → "30 pcs" en vert
```

**`MarginBadge`** — affiche la marge sur les formulaires de vente :
```tsx
// Dans LineItemsEditor, à côté du prix unitaire
<MarginBadge salePrice={150000} purchasePrice={80000} />
// → "Marge: 47%" en vert
```

### 12.4 Page Dashboard — modifications

- Remplacer 1 carte existante (ou ajouter sous les KPIs actuels) :
  - **"Achats du mois"** : montant HT + variation vs mois précédent
  - **"Marge brute"** : pourcentage + montant + sparkline 6 mois
  - **"Dettes fournisseurs"** : solde total dû + badge alerte si > 0
  - **"Stock critique"** : nombre de produits sous le seuil, avec lien vers `/purchases/stock`

---

## 13. Plan d'implémentation

### Phase 1 — Base de données et modèles Prisma (1-2 jours)

1. Ajouter les nouveaux enums dans `prisma/schema.prisma`
2. Ajouter les champs sur `Product` (`purchasePriceHt`, `stockQuantity`, `stockMinAlert`, `trackStock`)
3. Ajouter les 7 nouveaux modèles
4. Ajouter les relations manquantes sur les modèles existants
5. `prisma migrate dev --name add_purchases_module`
6. Vérifier que la migration n'est pas destructive

### Phase 2 — Backend : Fournisseurs (1 jour)

1. `suppliers.schema.ts` — Zod schemas (CreateSupplierInput, ListSuppliersInput, etc.)
2. `suppliers.service.ts` — CRUD + archive + balance
3. `suppliers.controller.ts`
4. `suppliers.routes.ts` — avec `authorize()` et `auditMiddleware`
5. Enregistrer dans `app.ts`
6. Tests Postman

### Phase 3 — Backend : Bons de commande (2 jours)

1. `purchase-orders.schema.ts` — incluant ReceiveOrderInput
2. `purchase-orders.service.ts`
   - `create`, `update`, `list`, `findById`, `softDelete`
   - `send`, `confirm`, `receive` (transaction stock), `cancel`
   - `duplicate`, `generatePdf`
3. `purchase-orders.controller.ts`
4. `purchase-orders.routes.ts`
5. Ajouter PDF template dans `src/lib/pdf.ts` pour BC

### Phase 4 — Backend : Factures et Paiements fournisseur (2 jours)

1. `supplier-invoices.schema.ts`
2. `supplier-invoices.service.ts`
   - `create`, `update`, `list`, `validate`, `dispute`, `cancel`
   - `addPayment`, `deletePayment` (avec recalcul solde)
3. `supplier-invoices.controller.ts`
4. `supplier-invoices.routes.ts`

### Phase 5 — Backend : Rapports, Dashboard, Jobs (1 jour)

1. Ajouter `getPurchases`, `getPurchasesBySupplier`, `getMargins`, `getPurchaseTaxSummary` dans `reports.service.ts`
2. Mettre à jour `dashboard.service.ts` pour les nouveaux KPIs
3. Modifier `overdue.processor.ts` pour les factures fournisseur en retard + alertes stock
4. Créer `purchase-reminder.processor.ts`
5. Ajouter le cron dans `scheduler.ts`
6. Mettre à jour le global search

### Phase 6 — Frontend (4-5 jours)

1. Types TypeScript : `src/features/purchases/types.ts`
2. API client : `src/features/purchases/api.ts`
3. Hooks TanStack Query : `src/features/purchases/hooks.ts`
4. Pages et composants (dans l'ordre d'usage logique) :
   - Fournisseurs (liste + formulaire)
   - Bons de commande (liste + formulaire + modal réception)
   - Factures fournisseur (liste + formulaire + modal paiement)
   - Stock (vue + historique mouvements)
5. Mise à jour sidebar
6. Mise à jour dashboard (nouveaux KPIs)
7. Mise à jour page Rapports (onglet Achats & Marges)
8. `MarginBadge` dans `LineItemsEditor` (formulaires proforma/facture)
9. `StockBadge` dans la liste des produits

---

## Annexe — Checklist d'intégration

### Backend
- [ ] `prisma/schema.prisma` — nouveaux enums + modèles + champs Product
- [ ] `prisma/migrations/` — migration propre et non-destructive
- [ ] `src/modules/suppliers/` — 4 fichiers (schema, service, controller, routes)
- [ ] `src/modules/purchase-orders/` — 4 fichiers
- [ ] `src/modules/supplier-invoices/` — 4 fichiers
- [ ] `src/lib/pdf.ts` — template PDF pour BC et reçu paiement fournisseur
- [ ] `src/modules/reports/reports.service.ts` — 4 nouvelles méthodes
- [ ] `src/modules/dashboard/dashboard.service.ts` — nouveaux KPIs
- [ ] `src/jobs/processors/overdue.processor.ts` — factures fournisseur overdue + stock
- [ ] `src/jobs/processors/purchase-reminder.processor.ts` — nouveau fichier
- [ ] `src/jobs/scheduler.ts` — cron purchase-reminder
- [ ] `src/modules/search/search.routes.ts` — indexer suppliers + purchase-orders
- [ ] `src/app.ts` — enregistrer les nouvelles routes

### Frontend
- [ ] `src/features/purchases/types.ts`
- [ ] `src/features/purchases/api.ts`
- [ ] `src/features/purchases/hooks.ts`
- [ ] `src/app/(dashboard)/purchases/` — 5 pages
- [ ] `src/features/suppliers/` — SupplierForm, SupplierList
- [ ] `src/features/purchase-orders/` — PurchaseOrderForm, ReceiveOrderModal
- [ ] `src/features/supplier-invoices/` — SupplierInvoiceForm, SupplierPaymentModal
- [ ] `src/features/stock/` — StockView, StockMovementHistory
- [ ] `src/store/sidebar.ts` — ajouter section Achats
- [ ] `src/features/products/` — StockBadge, champs achat dans ProductForm
- [ ] `src/features/invoices/LineItemsEditor.tsx` — MarginBadge
- [ ] `src/app/(dashboard)/dashboard/` — nouveaux KPIs purchases
- [ ] `src/app/(dashboard)/reports/` — onglet Achats & Marges

---

*Document généré le 2026-04-11 — InvoiceHub v2.0 BTS*
