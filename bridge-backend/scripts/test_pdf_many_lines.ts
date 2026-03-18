/**
 * Script de test : génération d'une facture PDF avec beaucoup de lignes produit.
 * Exécuter depuis bridge-backend/ :
 *   npx tsx test_pdf_many_lines.ts
 */
// Les variables d'env sont injectées via le shell avant l'import (voir commande d'exécution)

import fs from 'fs';
import path from 'path';
import { buildDocumentHtml, generatePdf } from '../src/lib/pdf';

// ── Données de test ───────────────────────────────────────────────────────────

const lines = [
  { designation: 'Serveur Dell PowerEdge R750',          description: 'Serveur rack 2U, Intel Xeon Silver 4310, 64 Go RAM DDR4, 2×960 Go SSD',                          reference: 'SRV-001', quantity: 2,  unit: 'u',     unitPriceHt: 2_850_000, netHt: 5_700_000, taxRate: 19.25 },
  { designation: 'Switch Cisco Catalyst 2960-X',          description: 'Switch 48 ports GE, 4 SFP+, gestion VLAN, PoE+, empilable',                                       reference: 'NET-012', quantity: 3,  unit: 'u',     unitPriceHt:   480_000, netHt: 1_440_000, taxRate: 19.25 },
  { designation: 'Câblage réseau catégorie 6A',           description: 'Installation complète câblage STP Cat6A, RJ45 blindés, chemins de câbles inclus',                  reference: 'CAB-006', quantity: 1,  unit: 'forfait', unitPriceHt:   750_000, netHt:   750_000, taxRate: 19.25 },
  { designation: 'UPS APC Smart-UPS 3000VA',              description: 'Onduleur ligne-interactive 3000 VA / 2700 W, autonomie 12 min pleine charge, SNMP',               reference: 'UPS-003', quantity: 2,  unit: 'u',     unitPriceHt:   620_000, netHt: 1_240_000, taxRate: 19.25 },
  { designation: 'Licence Windows Server 2022 Datacenter',description: 'Licence OEM 16 cœurs, droits virtualisation illimités',                                            reference: 'LOG-045', quantity: 2,  unit: 'lic',   unitPriceHt:   990_000, netHt: 1_980_000, taxRate: 19.25 },
  { designation: 'Licence Microsoft 365 Business Premium', description: 'Suite Office 365, Exchange Online, Teams, SharePoint, Intune — par utilisateur/an',              reference: 'LOG-101', quantity: 50, unit: 'u/an',  unitPriceHt:    85_000, netHt: 4_250_000, taxRate: 19.25 },
  { designation: 'Pare-feu Fortinet FortiGate 100F',      description: 'UTM 10 Gbps, IPS/IDS, VPN SSL, filtrage URL, antivirus intégré, FortiGuard 1 an',                reference: 'SEC-008', quantity: 1,  unit: 'u',     unitPriceHt: 1_450_000, netHt: 1_450_000, taxRate: 19.25 },
  { designation: 'Baie serveur 42U 19"',                  description: 'Armoire réseau 42U, panneau latéraux amovibles, prise multiple 16A, ventilation active haut',    reference: 'BAI-002', quantity: 1,  unit: 'u',     unitPriceHt:   380_000, netHt:   380_000, taxRate: 19.25 },
  { designation: 'NAS Synology RS3621XS+',                description: 'NAS rack 12 baies, Xeon D-1531, 32 Go ECC, iSCSI, Snapshot Replication, 2×10GbE',               reference: 'STG-009', quantity: 1,  unit: 'u',     unitPriceHt: 1_980_000, netHt: 1_980_000, taxRate: 19.25 },
  { designation: 'Disques durs WD Gold 16 To',            description: 'HDD entreprise 7200 tr/min, 512e, SATA III 6 Gb/s, garantie 5 ans',                              reference: 'STG-016', quantity: 12, unit: 'u',     unitPriceHt:   195_000, netHt: 2_340_000, taxRate: 19.25 },
  { designation: 'Point d\'accès Wi-Fi 6 Cisco 9120',     description: 'AP Wi-Fi 6 (802.11ax), 4×4 MIMO, 5.4 Gbps, PoE+, Cisco DNA Center',                             reference: 'NET-022', quantity: 8,  unit: 'u',     unitPriceHt:   285_000, netHt: 2_280_000, taxRate: 19.25 },
  { designation: 'Câbles fibre optique OM4 duplex',       description: 'Cordons LC/LC, OM4 50/125, longueur 5 m, gainé PVC, atténuation ≤3,5 dB/km',                   reference: 'CAB-018', quantity: 20, unit: 'u',     unitPriceHt:    18_500, netHt:   370_000, taxRate: 19.25 },
  { designation: 'Transceivers SFP+ 10G SR',              description: 'Module SFP+ 10GBase-SR, longueur d\'onde 850 nm, distance max 300 m (OM4)',                       reference: 'NET-031', quantity: 12, unit: 'u',     unitPriceHt:    45_000, netHt:   540_000, taxRate: 19.25 },
  { designation: 'Installation et configuration réseau',  description: 'Mise en rack, câblage, configuration VLAN, QoS, OSPF, tests de conformité — équipe 3 techniciens',reference: 'SVC-001', quantity: 10, unit: 'j/h',  unitPriceHt:   120_000, netHt: 1_200_000, taxRate: 19.25 },
  { designation: 'Migration des données',                  description: 'Sauvegarde, migration et restauration des données existantes vers la nouvelle infrastructure',     reference: 'SVC-002', quantity: 5,  unit: 'j/h',  unitPriceHt:   120_000, netHt:   600_000, taxRate: 19.25 },
  { designation: 'Formation administrateurs (3 jours)',   description: 'Formation présentielle sur les équipements installés : réseau, serveurs, sécurité, sauvegarde',   reference: 'SVC-010', quantity: 3,  unit: 'j',    unitPriceHt:   200_000, netHt:   600_000, taxRate: 19.25 },
  { designation: 'Contrat de maintenance préventive 1 an',description: 'Visites trimestrielles, rapport d\'état, mises à jour firmware, hotline 8h-18h du lundi au vendredi',reference:'SVC-020', quantity: 1, unit: 'an',   unitPriceHt:   950_000, netHt:   950_000, taxRate: 19.25 },
  { designation: 'Logiciel supervision Zabbix (setup)',   description: 'Déploiement Zabbix 6.4, agents sur tous les équipements, dashboards, alertes email/SMS',          reference: 'LOG-088', quantity: 1,  unit: 'forfait', unitPriceHt:   450_000, netHt:   450_000, taxRate: 19.25 },
  { designation: 'Certificat SSL Wildcard 2 ans',         description: 'Certificat TLS/SSL wildcard *.bts.cm, validation OV, 2 ans, déploiement inclus',                  reference: 'SEC-041', quantity: 1,  unit: 'u',     unitPriceHt:   185_000, netHt:   185_000, taxRate: 19.25 },
  { designation: 'Frais de transport et livraison',       description: 'Transport sécurisé des équipements depuis Douala vers site client, assurance incluse',             reference: 'LOG-200', quantity: 1,  unit: 'forfait', unitPriceHt:   120_000, netHt:   120_000, taxRate: 19.25 },
];

const subtotalHt = lines.reduce((s, l) => s + l.netHt, 0);
const totalTax   = lines.reduce((s, l) => s + l.netHt * l.taxRate / 100, 0);
const totalTtc   = subtotalHt + totalTax;

const params = {
  type:            'Facture' as const,
  number:          'BTS/DC/2026/03/FAC042',
  issueDate:       '10/03/2026',
  dueDate:         '10/04/2026',
  clientName:      'SOCIÉTÉ CAMEROUNAISE DE TÉLÉCOMMUNICATIONS (SCT)',
  clientStreet:    'Boulevard de la Liberté, Immeuble Telecenter, 3e étage',
  clientBP:        'B.P. 4200 Douala — Cameroun',
  clientPhone:     '+237 233 42 00 00',
  clientEmail:     'direction.si@sct.cm',
  clientTaxNumber: 'M0876543210A',
  clientRccm:      'RC/DLA/2001/B/5412',
  contactPerson:   'direction@bts.cm',
  lines,
  subtotalHt,
  totalTax,
  totalTtc,
  currency:        'XAF',
  paymentConditions: '30 jours net — Virement bancaire sur compte BTS SARL — Afriland First Bank N° 10006-00010-00123456789-77',
  notes:           'Les équipements bénéficient d\'une garantie constructeur de 3 ans minimum. Le câblage est certifié conformément à la norme ISO/IEC 11801 par un technicien accrédité. Une attestation de conformité sera remise à la réception des travaux.',
};

// ── Génération ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Génération du PDF — ${lines.length} lignes produit...`);
  console.log(`Sous-total HT : ${subtotalHt.toLocaleString('fr-FR')} XAF`);
  console.log(`TVA (19.25%) : ${Math.round(totalTax).toLocaleString('fr-FR')} XAF`);
  console.log(`Total TTC : ${Math.round(totalTtc).toLocaleString('fr-FR')} XAF`);

  const html   = buildDocumentHtml(params);
  const pdfBuf = await generatePdf(html);

  const outPath = path.resolve('./test_facture_many_lines.pdf');
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`\nPDF généré : ${outPath} (${(pdfBuf.length / 1024).toFixed(0)} Ko)`);
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
