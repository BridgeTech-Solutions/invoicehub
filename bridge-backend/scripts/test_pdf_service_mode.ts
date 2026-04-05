/**
 * Script de test : mode service (hideDetails) — tableau mixte + all-service.
 * npx tsx scripts/test_pdf_service_mode.ts
 *
 * Génère 2 PDFs :
 *  1. test_service_mixte.pdf  — lignes produits + lignes service mélangées
 *  2. test_service_all.pdf    — toutes les lignes en mode service (tableau simplifié)
 */
import fs from 'fs';
import path from 'path';
import { buildDocumentHtml, generatePdf } from '../src/lib/pdf';

// ── Données communes ───────────────────────────────────────────────────────────

const clientInfo = {
  clientName:      'SOCIÉTÉ CAMEROUNAISE DE TÉLÉCOMMUNICATIONS (SCT)',
  clientStreet:    'Boulevard de la Liberté, Immeuble Telecenter, 3e étage',
  clientBP:        'B.P. 4200 Douala — Cameroun',
  clientPhone:     '+237 233 42 00 00',
  clientEmail:     'direction.si@sct.cm',
  clientTaxNumber: 'M0876543210A',
  clientRccm:      'RC/DLA/2001/B/5412',
  currency:        'XAF',
  paymentConditions: '30 jours net — Virement bancaire Afriland First Bank N° 10006-00010-00123456789-77',
};

// ── 1. Tableau MIXTE : produits + services ─────────────────────────────────────

const mixedLines = [
  // Produit normal
  {
    designation:  'Serveur Dell PowerEdge R750',
    description:  'Serveur rack 2U, Intel Xeon Silver 4310, 64 Go RAM DDR4, 2×960 Go SSD',
    reference:    'SRV-001',
    quantity:     2,
    unit:         'u',
    unitPriceHt:  2_850_000,
    netHt:        5_700_000,
    taxRate:      19.25,
    hideDetails:  false,
  },
  // Service — colSpan doit fusionner Ref+Désig+PU+Qté
  {
    designation:  'Audit et conseil en architecture réseau',
    description:  'Analyse de l\'existant, préconisations, rédaction du cahier des charges technique',
    reference:    'SVC-001',
    quantity:     1,
    unit:         'forfait',
    unitPriceHt:  850_000,
    netHt:        850_000,
    taxRate:      19.25,
    hideDetails:  true,
  },
  // Produit normal
  {
    designation:  'Switch Cisco Catalyst 2960-X',
    description:  'Switch 48 ports GE, 4 SFP+, gestion VLAN, PoE+',
    reference:    'NET-012',
    quantity:     3,
    unit:         'u',
    unitPriceHt:  480_000,
    netHt:        1_440_000,
    taxRate:      19.25,
    hideDetails:  false,
  },
  // Service — colSpan doit fusionner
  {
    designation:  'Formation administrateurs réseau',
    description:  'Formation sur site 3 jours — 8 participants max — support de cours inclus',
    reference:    'SVC-002',
    quantity:     1,
    unit:         'forfait',
    unitPriceHt:  550_000,
    netHt:        550_000,
    taxRate:      19.25,
    hideDetails:  true,
  },
  // Produit normal
  {
    designation:  'UPS APC Smart-UPS 3000VA',
    description:  'Onduleur 3000 VA / 2700 W, autonomie 12 min, gestion SNMP',
    reference:    'UPS-003',
    quantity:     2,
    unit:         'u',
    unitPriceHt:  620_000,
    netHt:        1_240_000,
    taxRate:      19.25,
    hideDetails:  false,
  },
  // Service — colSpan
  {
    designation:  'Maintenance préventive annuelle',
    description:  'Contrat de maintenance : visites trimestrielles, hotline 8h–18h, pièces incluses',
    reference:    'SVC-003',
    quantity:     1,
    unit:         'an',
    unitPriceHt:  1_200_000,
    netHt:        1_200_000,
    taxRate:      19.25,
    hideDetails:  true,
  },
];

// ── 2. Tableau ALL-SERVICE ─────────────────────────────────────────────────────

const allServiceLines = [
  {
    designation: 'Conseil stratégique en transformation digitale',
    description: 'Accompagnement direction — 10 séances de 2h — livrables : roadmap et KPIs',
    reference: 'CONS-001', quantity: 1, unit: 'forfait', unitPriceHt: 1_500_000, netHt: 1_500_000, taxRate: 19.25,
    hideDetails: true,
  },
  {
    designation: 'Développement application mobile (iOS + Android)',
    description: 'Application cross-platform React Native — authentification, notifications push, API REST',
    reference: 'DEV-002', quantity: 1, unit: 'forfait', unitPriceHt: 4_200_000, netHt: 4_200_000, taxRate: 19.25,
    hideDetails: true,
  },
  {
    designation: 'Hébergement cloud sécurisé (12 mois)',
    description: 'Infrastructure Azure — 2 VMs, load balancer, SSL, backups quotidiens, monitoring',
    reference: 'CLOUD-003', quantity: 1, unit: 'an', unitPriceHt: 960_000, netHt: 960_000, taxRate: 19.25,
    hideDetails: true,
  },
  {
    designation: 'Support et maintenance applicative',
    description: 'Contrat de support niveau 2 — SLA 4h — tickets illimités — mises à jour incluses',
    reference: 'SUP-004', quantity: 1, unit: 'an', unitPriceHt: 720_000, netHt: 720_000, taxRate: 19.25,
    hideDetails: true,
  },
];

// ── Génération ─────────────────────────────────────────────────────────────────

async function main() {

  // — PDF 1 : tableau mixte
  {
    const subtotalHt = mixedLines.reduce((s, l) => s + l.netHt, 0);
    const totalTax   = mixedLines.reduce((s, l) => s + l.netHt * l.taxRate / 100, 0);
    const totalTtc   = subtotalHt + totalTax;

    console.log('\n── Facture MIXTE (produits + services) ──');
    console.log(`Lignes : ${mixedLines.length} (${mixedLines.filter(l => l.hideDetails).length} service, ${mixedLines.filter(l => !l.hideDetails).length} produit)`);
    console.log(`Total HT  : ${subtotalHt.toLocaleString('fr-FR')} XAF`);
    console.log(`TVA       : ${Math.round(totalTax).toLocaleString('fr-FR')} XAF`);
    console.log(`Total TTC : ${Math.round(totalTtc).toLocaleString('fr-FR')} XAF`);

    const html   = buildDocumentHtml({
      ...clientInfo,
      type:       'Facture',
      number:     'BTS/DC/2026/03/FAC042',
      issueDate:  '22/03/2026',
      dueDate:    '21/04/2026',
      lines:      mixedLines,
      subtotalHt,
      totalTax,
      totalTtc,
      notes:      'Les lignes de prestation (en italique) sont facturées au forfait — aucun détail Qté/PU n\'est communiqué conformément à notre politique tarifaire.',
    });
    const pdfBuf = await generatePdf(html);
    const outPath = path.resolve('./test_service_mixte.pdf');
    fs.writeFileSync(outPath, pdfBuf);
    console.log(`PDF généré : ${outPath} (${(pdfBuf.length / 1024).toFixed(0)} Ko)`);
  }

  // — PDF 2 : all-service
  {
    const subtotalHt = allServiceLines.reduce((s, l) => s + l.netHt, 0);
    const totalTax   = allServiceLines.reduce((s, l) => s + l.netHt * l.taxRate / 100, 0);
    const totalTtc   = subtotalHt + totalTax;

    console.log('\n── Facture ALL-SERVICE (tableau simplifié) ──');
    console.log(`Lignes : ${allServiceLines.length} (toutes en mode service)`);
    console.log(`Total HT  : ${subtotalHt.toLocaleString('fr-FR')} XAF`);
    console.log(`TVA       : ${Math.round(totalTax).toLocaleString('fr-FR')} XAF`);
    console.log(`Total TTC : ${Math.round(totalTtc).toLocaleString('fr-FR')} XAF`);

    const html   = buildDocumentHtml({
      ...clientInfo,
      type:       'Facture',
      number:     'BTS/DC/2026/03/FAC043',
      issueDate:  '22/03/2026',
      dueDate:    '21/04/2026',
      lines:      allServiceLines,
      subtotalHt,
      totalTax,
      totalTtc,
      notes:      'Facture de prestations intellectuelles — TVA 19,25% applicable sur les services numériques conformément au CGI camerounais.',
    });
    const pdfBuf = await generatePdf(html);
    const outPath = path.resolve('./test_service_all.pdf');
    fs.writeFileSync(outPath, pdfBuf);
    console.log(`PDF généré : ${outPath} (${(pdfBuf.length / 1024).toFixed(0)} Ko)`);
  }

  console.log('\nTerminé.');
}

main().catch(err => { console.error('Erreur :', err.message); process.exit(1); });
