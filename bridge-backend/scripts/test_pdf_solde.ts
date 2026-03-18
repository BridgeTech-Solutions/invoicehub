/**
 * Script de test : génération d'une facture de solde PDF.
 * Exécuter depuis bridge-backend/ :
 *   npx tsx test_pdf_solde.ts
 */

import fs from 'fs';
import path from 'path';
import { buildDocumentHtml, generatePdf } from '../src/lib/pdf';

const lines = [
  { designation: 'Serveur Dell PowerEdge R750',           description: 'Serveur rack 2U, Intel Xeon Silver 4310, 64 Go RAM DDR4, 2×960 Go SSD',                         reference: 'SRV-001', quantity: 2,  unit: 'u',      unitPriceHt: 2_850_000, netHt: 5_700_000, taxRate: 19.25 },
  { designation: 'Switch Cisco Catalyst 2960-X',           description: 'Switch 48 ports GE, 4 SFP+, gestion VLAN, PoE+, empilable',                                      reference: 'NET-012', quantity: 3,  unit: 'u',      unitPriceHt:   480_000, netHt: 1_440_000, taxRate: 19.25 },
  { designation: 'Câblage réseau catégorie 6A',            description: 'Installation complète câblage STP Cat6A, RJ45 blindés, chemins de câbles inclus',                 reference: 'CAB-006', quantity: 1,  unit: 'forfait', unitPriceHt:   750_000, netHt:   750_000, taxRate: 19.25 },
  { designation: 'UPS APC Smart-UPS 3000VA',               description: 'Onduleur ligne-interactive 3000 VA / 2700 W, autonomie 12 min pleine charge, SNMP',              reference: 'UPS-003', quantity: 2,  unit: 'u',      unitPriceHt:   620_000, netHt: 1_240_000, taxRate: 19.25 },
  { designation: 'Licence Windows Server 2022 Datacenter', description: 'Licence OEM 16 cœurs, droits virtualisation illimités',                                           reference: 'LOG-045', quantity: 2,  unit: 'lic',    unitPriceHt:   990_000, netHt: 1_980_000, taxRate: 19.25 },
  { designation: 'Pare-feu Fortinet FortiGate 100F',       description: 'UTM 10 Gbps, IPS/IDS, VPN SSL, filtrage URL, antivirus intégré, FortiGuard 1 an',               reference: 'SEC-008', quantity: 1,  unit: 'u',      unitPriceHt: 1_450_000, netHt: 1_450_000, taxRate: 19.25 },
  { designation: 'NAS Synology RS3621XS+',                 description: 'NAS rack 12 baies, Xeon D-1531, 32 Go ECC, iSCSI, Snapshot Replication, 2×10GbE',              reference: 'STG-009', quantity: 1,  unit: 'u',      unitPriceHt: 1_980_000, netHt: 1_980_000, taxRate: 19.25 },
  { designation: 'Installation et configuration réseau',   description: 'Mise en rack, câblage, configuration VLAN, QoS, OSPF, tests de conformité',                      reference: 'SVC-001', quantity: 10, unit: 'j/h',    unitPriceHt:   120_000, netHt: 1_200_000, taxRate: 19.25 },
];

const subtotalHt = lines.reduce((s, l) => s + l.netHt, 0);
const totalTax   = lines.reduce((s, l) => s + l.netHt * l.taxRate / 100, 0);
const totalTtc   = subtotalHt + totalTax;

// Acompte déjà versé : 30%
const acomptePercentage = 30;
const acompteHt         = subtotalHt * acomptePercentage / 100;
const acompteTax        = totalTax   * acomptePercentage / 100;

// Solde = 70%
const soldeHt  = subtotalHt - acompteHt;
const soldeTax = totalTax   - acompteTax;
const soldeTtc = soldeHt + soldeTax;

const params = {
  type:               'Facture Solde' as const,
  number:             'BTS/DC/2026/03/FAC043',
  issueDate:          '15/03/2026',
  dueDate:            '30/03/2026',
  clientName:         'SOCIÉTÉ CAMEROUNAISE DE TÉLÉCOMMUNICATIONS (SCT)',
  clientStreet:       'Boulevard de la Liberté, Immeuble Telecenter, 3e étage',
  clientBP:           'B.P. 4200 Douala — Cameroun',
  clientPhone:        '+237 233 42 00 00',
  clientEmail:        'direction.si@sct.cm',
  clientTaxNumber:    'M0876543210A',
  clientRccm:         'RC/DLA/2001/B/5412',
  contactPerson:      'direction@bts.cm',
  lines,
  subtotalHt,
  totalTax,
  totalTtc:           soldeTtc,   // TTC du solde uniquement
  soldeHt,
  soldeTax,
  currency:           'XAF',
  paymentConditions:  'Solde à la livraison — Virement bancaire — Afriland First Bank N° 10006-00010-00123456789-77',
  notes:              'Ce solde correspond aux 70% restants suite à l\'acompte BTS/DC/2026/03/ACP007 versé le 25/03/2026. Livraison et installation confirmées.',
};

async function main() {
  console.log(`Génération Facture Solde — ${lines.length} lignes...`);
  console.log(`Sous-total HT projet : ${subtotalHt.toLocaleString('fr-FR')} XAF`);
  console.log(`Solde HT (70%)       : ${Math.round(soldeHt).toLocaleString('fr-FR')} XAF`);
  console.log(`TVA sur solde        : ${Math.round(soldeTax).toLocaleString('fr-FR')} XAF`);
  console.log(`Total TTC solde      : ${Math.round(soldeTtc).toLocaleString('fr-FR')} XAF`);

  const html   = buildDocumentHtml(params);
  const pdfBuf = await generatePdf(html);

  const outPath = path.resolve('./test_facture_solde.pdf');
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`\nPDF généré : ${outPath} (${(pdfBuf.length / 1024).toFixed(0)} Ko)`);
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
