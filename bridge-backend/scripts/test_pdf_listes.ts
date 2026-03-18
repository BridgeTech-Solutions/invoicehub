/**
 * Script de test : listes HTML (ul/ol) dans les descriptions produit.
 * npx tsx test_pdf_listes.ts
 */
import fs from 'fs';
import path from 'path';
import { buildDocumentHtml, generatePdf } from '../src/lib/pdf';

const lines = [
  {
    designation: 'Serveur Dell PowerEdge R750',
    description: '<strong>Serveur rack 2U</strong><ul><li>Intel Xeon Silver 4310</li><li>64 Go RAM DDR4</li><li>2×960 Go SSD NVMe</li><li>iDRAC9 Enterprise</li></ul>',
    reference: 'SRV-001', quantity: 2, unit: 'u', unitPriceHt: 2_850_000, netHt: 5_700_000, taxRate: 19.25,
  },
  {
    designation: 'Switch Cisco Catalyst 2960-X',
    description: 'Switch manageable<ol><li>48 ports Gigabit Ethernet</li><li>4 ports SFP+ 10G uplink</li><li>Budget PoE+ 740W</li><li>Gestion VLAN, QoS, OSPF</li></ol>',
    reference: 'NET-012', quantity: 3, unit: 'u', unitPriceHt: 480_000, netHt: 1_440_000, taxRate: 19.25,
  },
  {
    designation: 'Installation et configuration réseau',
    description: 'Prestation forfaitaire — mise en rack, câblage et tests de conformité',
    reference: 'SVC-001', quantity: 1, unit: 'forfait', unitPriceHt: 750_000, netHt: 750_000, taxRate: 19.25,
  },
];

const subtotalHt = lines.reduce((s, l) => s + l.netHt, 0);
const totalTax   = lines.reduce((s, l) => s + l.netHt * l.taxRate / 100, 0);
const totalTtc   = subtotalHt + totalTax;

async function main() {
  const html   = buildDocumentHtml({
    type: 'Facture',
    number: 'BTS/DC/2026/03/FAC099',
    issueDate: '18/03/2026',
    dueDate: '02/04/2026',
    clientName: 'TEST CLIENT LISTES',
    lines,
    subtotalHt,
    totalTax,
    totalTtc,
    currency: 'XAF',
  });
  const pdfBuf = await generatePdf(html);
  const outPath = path.resolve('./test_listes.pdf');
  fs.writeFileSync(outPath, pdfBuf);
  console.log(`PDF généré : ${outPath} (${(pdfBuf.length / 1024).toFixed(0)} Ko)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
