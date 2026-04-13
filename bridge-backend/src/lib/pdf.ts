/**
 * @module lib/pdf
 * Génération de PDF via Puppeteer (Chromium headless).
 *
 * Les templates reproduisent fidèlement les documents officiels BTS
 * (Bridge Technologies Solutions) avec header, footer et cachet réels.
 *
 * Les images sont lues depuis le dossier configuré par `COMPANY_ASSETS_DIR`
 * (défaut : `../../../company` relatif à ce fichier → racine du projet).
 * Elles sont intégrées en base64 dans le HTML pour garantir le rendu hors-ligne
 * avec Puppeteer qui utilise `page.setContent()` sans base URL.
 */
import fs   from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../core/middleware/requestLogger';

// ─── Assets ──────────────────────────────────────────────────────────────────

/**
 * Répertoire contenant les sous-dossiers headers/, footers/, seals/.
 * Chemin par défaut : bridge-backend/assets/company/ (embarqué dans le repo).
 * Peut être surchargé via la variable d'env COMPANY_ASSETS_DIR (ex: Docker volume).
 */
const ASSETS_DIR = process.env.COMPANY_ASSETS_DIR
  ?? path.resolve(__dirname, '../../assets/company');

/** Convertit une image en data URI base64 (graceful degradation si fichier absent). */
export function imgToBase64(filePath: string): string {
  try {
    const buf  = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).slice(1).toLowerCase();
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

/** Retourne le premier fichier image trouvé dans un sous-dossier d'assets. */
function firstImageIn(subfolder: string): string {
  const dir = path.join(ASSETS_DIR, subfolder);
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f));
  return files.length ? imgToBase64(path.join(dir, files[0])) : '';
}

// Cache par process (chargé une seule fois)
let _header: string | null = null;
let _footer: string | null = null;
let _seal:   string | null = null;

const getHeader = () => (_header ??= firstImageIn('headers'));
const getFooter = () => (_footer ??= firstImageIn('footers'));
const getSeal   = () => (_seal   ??= firstImageIn('seals'));

// ─── Génération PDF ───────────────────────────────────────────────────────────

/**
 * Génère un document PDF A4 à partir d'un HTML complet.
 *
 * Lance Chromium headless, injecte le HTML, attend la fin des ressources réseau
 * puis exporte en PDF. Le browser est toujours fermé même en cas d'erreur.
 *
 * @param html - HTML complet avec styles inlinés (images en base64)
 * @returns Buffer binaire du PDF
 */
/**
 * Génère un PDF A4 à partir d'un HTML complet.
 *
 * @param html              - HTML complet (images en base64)
 * @param footerSafeZonePx  - Hauteur en px de la zone protégée en bas du footer
 *                            (la zone contenant les infos entreprise que le contenu
 *                            ne doit jamais couvrir). Le contenu peut chevaucher
 *                            la partie décorative haute du footer, mais pas cette zone.
 *                            Si omis, toute la hauteur du footer est protégée.
 */
export async function generatePdf(html: string, footerSafeZonePx?: number): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // évite les crashs sur /dev/shm limité à 64 MB dans Docker
      '--disable-gpu',              // pas de GPU dans Docker — force le software rendering
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
    ],
  });
  try {
    const page = await browser.newPage();

    // Viewport calé sur A4 à 96 DPI pour des mesures cohérentes
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    // waitUntil:'load' suffit — toutes les images sont en base64 inline,
    // il n'y a aucune requête réseau à attendre.
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });

    // ── Mesures + extraction des assets + blanc bas du PNG ──────────────────
    const { footerSrc, headerMm, footerFullMm, companyInfoMm, bottomWhiteMm } =
      await page.evaluate((safeZonePx: number | undefined) => {
        const header    = document.querySelector('.page-header') as HTMLElement | null;
        const footerImg = document.querySelector('.page-footer img') as HTMLImageElement | null;
        const footer    = document.querySelector('.page-footer') as HTMLElement | null;

        const headerPx     = header?.offsetHeight ?? 0;
        const footerPx     = footer?.offsetHeight ?? 0;
        const headerMm     = Math.ceil(headerPx * 0.2646) + 2;
        const footerFullMm = Math.ceil(footerPx * 0.2646);

        // Zone infos entreprise = bas 22% du footer (mesurée à ~20%, +2% buffer)
        const companyInfoPx = safeZonePx ?? Math.round(footerPx * 0.22);
        const companyInfoMm = Math.ceil(companyInfoPx * 0.2646) + 3;

        // Mesure du blanc interne en bas du PNG via canvas.
        // Ce blanc serait sinon visible comme une bande blanche au bas de la page.
        let bottomWhiteMm = 0;
        if (footerImg && footerImg.naturalWidth > 0 && footerPx > 0) {
          try {
            const canvas  = document.createElement('canvas');
            const nw = footerImg.naturalWidth;
            const nh = footerImg.naturalHeight;
            canvas.width  = nw;
            canvas.height = nh;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(footerImg, 0, 0);
              const data = ctx.getImageData(0, 0, nw, nh).data;
              let whiteRows = 0;
              // Scan de bas en haut : on cherche la première ligne non-blanche
              for (let y = nh - 1; y >= 0; y--) {
                let rowIsWhite = true;
                for (let x = 0; x < nw; x++) {
                  const i = (y * nw + x) * 4;
                  if (data[i + 3] > 10 &&
                      (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240)) {
                    rowIsWhite = false;
                    break;
                  }
                }
                if (rowIsWhite) whiteRows++;
                else break;
              }
              // Convertit en mm selon le ratio naturel→rendu
              const whitePxRendered = whiteRows * (footerPx / nh);
              bottomWhiteMm = Math.floor(whitePxRendered * 0.2646);
            }
          } catch {
            // Canvas indisponible : pas de compensation
          }
        }

        return {
          footerSrc:     footerImg?.src ?? '',
          headerMm, footerFullMm, companyInfoMm, bottomWhiteMm,
        };
      }, footerSafeZonePx);

    // ── Stratégie footer : post-traitement pdf-lib ───────────────────────────
    //
    // footerTemplate se rend DEVANT le contenu → masque les lignes du tableau.
    // background-attachment:fixed ne se répète pas par page (coordonnées document).
    // position:fixed ne se répète pas non plus en mode impression Puppeteer.
    //
    // Solution : générer le PDF sans footer, puis avec pdf-lib ajouter l'image
    // footer EN FOND de chaque page (couche derrière le contenu).
    //
    // Marge basse Puppeteer = companyInfoMm (protège la zone infos entreprise) :
    // le contenu ne descend jamais dans cette bande, laissant le fond footer visible.
    const marginBottomMm = Math.max(companyInfoMm - bottomWhiteMm, 15);

    // Masquer header + footer du body (le footer sera injecté par pdf-lib)
    await page.evaluate(() => {
      const header = document.querySelector('.page-header') as HTMLElement | null;
      const footer = document.querySelector('.page-footer') as HTMLElement | null;
      header?.style.setProperty('display', 'none');
      footer?.style.setProperty('display', 'none');
    });

    // Styles de reset pour le headerTemplate uniquement
    const tplStyle = `<style>
      *{margin:0!important;padding:0!important;box-sizing:border-box;}
      html,body{font-size:0!important;line-height:0!important;}
      img{display:block!important;width:100%!important;height:auto!important;border:0;}
    </style>`;

    // footerTemplate vide : le footer est géré par pdf-lib après génération
    const footerTemplate = tplStyle + '<span></span>';

    // Header : position:fixed;top:0;left:0;width:210mm — même technique que le footer,
    // contourne les marges par défaut de Puppeteer pour coller au bord haut-gauche.
    const headerSrc = (await page.evaluate(
      () => (document.querySelector('.page-header img') as HTMLImageElement | null)?.src ?? ''
    ));
    const headerTemplate = tplStyle +
      (headerSrc
        ? `<img src="${headerSrc}" style="position:fixed!important;top:0!important;left:0!important;width:210mm!important;display:block!important;" />`
        : '');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top:    `${headerMm}mm`,
        bottom: `${marginBottomMm}mm`,
        left:   '0',
        right:  '0',
      },
    });

    logger.debug('PDF puppeteer done', { size: pdf.length, headerMm, marginBottomMm, companyInfoMm, bottomWhiteMm, footerFullMm });

    // ── Post-traitement pdf-lib : footer en fond de chaque page ──────────────
    // On insère l'image footer AVANT le contenu de chaque page via pdf-lib,
    // de sorte qu'elle s'affiche derrière (couche inférieure).
    if (!footerSrc) {
      return Buffer.from(pdf);
    }

    // Décoder le data URI base64 en Buffer
    const footerB64 = footerSrc.replace(/^data:image\/\w+;base64,/, '');
    const footerBuf = Buffer.from(footerB64, 'base64');

    const pdfDoc    = await PDFDocument.load(pdf);
    const footerImg = footerSrc.startsWith('data:image/png')
      ? await pdfDoc.embedPng(footerBuf)
      : await pdfDoc.embedJpg(footerBuf);

    const pages = pdfDoc.getPages();
    for (const pdfPage of pages) {
      const { width, height } = pdfPage.getSize();

      // Hauteur de l'image proportionnelle à la largeur de la page
      const imgH = (footerImg.height / footerImg.width) * width;
      // Compenser le blanc interne en bas du PNG (bottomWhiteMm → points PDF)
      const bottomOffsetPt = bottomWhiteMm > 0 ? bottomWhiteMm * 2.8346 : 0;

      // ── Insérer l'image AVANT le contenu existant ──────────────────────────
      // pdf-lib drawImage() ajoute à la fin du flux de contenu (devant).
      // Pour la mettre DERRIÈRE : on sauvegarde le contenu existant, on vide,
      // on dessine l'image, puis on ré-injecte le contenu original par-dessus.
      const { PDFName, PDFArray } = await import('pdf-lib');

      // 1. Capturer les refs du contenu actuel
      const existingContentsRef = pdfPage.node.get(PDFName.of('Contents'));

      // 2. Effacer Contents temporairement pour que drawImage crée un nouveau flux seul
      pdfPage.node.delete(PDFName.of('Contents'));

      // 3. Dessiner le footer (seul flux sur la page à ce stade)
      pdfPage.drawImage(footerImg, {
        x:      0,
        y:      -bottomOffsetPt,
        width,
        height: imgH,
      });

      // 4. Récupérer le flux footer (seul flux actuel)
      const footerContentsRef = pdfPage.node.get(PDFName.of('Contents'));

      // 5. Reconstruire Contents = [footerFlux, ...contenuOriginal]
      //    Le footer est en premier → rendu derrière le contenu HTML
      const combined = pdfDoc.context.obj([]);
      type PDFArrayLike = { push(v: unknown): void; asArray(): unknown[] };
      if (footerContentsRef) {
        if (footerContentsRef instanceof PDFArray) {
          footerContentsRef.asArray().forEach(r => (combined as unknown as PDFArrayLike).push(r));
        } else {
          (combined as unknown as PDFArrayLike).push(footerContentsRef);
        }
      }
      if (existingContentsRef) {
        if (existingContentsRef instanceof PDFArray) {
          existingContentsRef.asArray().forEach(r => (combined as unknown as PDFArrayLike).push(r));
        } else {
          (combined as unknown as PDFArrayLike).push(existingContentsRef);
        }
      }
      pdfPage.node.set(PDFName.of('Contents'), combined);
    }

    const finalPdf = await pdfDoc.save();
    logger.debug('PDF final (with footer background)', { size: finalPdf.length });
    return Buffer.from(finalPdf);
  } finally {
    await browser.close();
  }
}

// ─── Interface ────────────────────────────────────────────────────────────────

/** Ligne de détail d'un document commercial */
export interface DocumentLine {
  /** Référence produit (SKU) — affiché dans les factures, absent des proformas */
  reference?: string;
  /**
   * Description riche de la ligne — contenu de la colonne "Désignation" sur le PDF.
   * Peut contenir du HTML (<b>, <i>, <ul>, <ol>…) produit par l'éditeur riche du frontend.
   * Si absent, `designation` est utilisé en fallback.
   */
  description?: string;
  /** Titre court interne (fallback si description absente) */
  designation: string;
  quantity: number;
  unit: string;
  /** Prix unitaire HT */
  unitPriceHt: number;
  /**
   * Montant HT net de la ligne après remises individuelles.
   * Correspond à la colonne **PT** dans les templates BTS.
   */
  netHt: number;
  /** Taux de TVA en % (ex : 19.25) */
  taxRate: number;
  /**
   * Libellé de la remise individuelle de cette ligne (ex : "10%" ou "5 000 XAF").
   * Si absent ou undefined, la cellule Remise affiche "—".
   * La colonne Remise n'est rendue que si au moins une ligne a ce champ renseigné.
   */
  discountLabel?: string;
  /**
   * Mode service : masque Ref / Qté / PU sur le PDF.
   * La colonne PT affiche directement le montant de la prestation.
   * La quantité est forcée à 1 côté saisie, PU = montant total.
   */
  hideDetails?: boolean;
}

/**
 * Paramètres de construction du template HTML d'un document commercial BTS.
 *
 * - **Proforma** : layout centré, info-table, 4 colonnes, conditions, cachet.
 * - **Facture** : titre centré, table client complète, 5 colonnes, table paiement.
 * - **Facture Acompte** : side-by-side (client gauche / titre droite), totaux acompte.
 * - **Facture Solde** : même layout que Acompte, totaux solde.
 * - **Avoir** : identique à Facture.
 */
export interface DocumentHtmlParams {
  /** Type de document — détermine le layout et les libellés */
  type: 'Proforma' | 'Facture' | 'Facture Acompte' | 'Facture Solde' | 'Avoir';
  /** Numéro SYSCOHADA (ex : BTS/DC/2026/01/fac001) */
  number: string;
  /** Date d'émission formatée en FR (ex : 06/01/2026) */
  issueDate: string;
  /** Date d'échéance (factures) */
  dueDate?: string;
  /** Date de validité (proformas) */
  validUntil?: string;

  // ── Client ──────────────────────────────────────────────────────────────────
  clientName: string;
  /** Rue / adresse physique */
  clientStreet?: string;
  /** Boîte postale + ville (ex : "660 Douala-Cameroun") */
  clientBP?: string;
  clientPhone?: string;
  clientEmail?: string;
  /** NIU Cameroun du client */
  clientTaxNumber?: string;
  /** RCCM du client */
  clientRccm?: string;
  /** Numéro de compte bancaire du client (pour la table de paiement) */
  clientBankAccount?: string;
  /** Email de la personne à contacter chez BTS (table de paiement) */
  contactPerson?: string;

  // ── Contenu ─────────────────────────────────────────────────────────────────
  /** Objet / service (proforma) */
  subject?: string;
  lines: DocumentLine[];

  // ── Totaux projet complet ────────────────────────────────────────────────────
  /**
   * Total HT du projet (avant déduction acompte/solde).
   * Pour acompte/solde : correspond au total HT de la totalité du devis.
   */
  subtotalHt: number;
  /** TVA totale du projet complet */
  totalTax: number;
  /**
   * - Standard / Avoir : TTC complet.
   * - Acompte : TTC de l'acompte uniquement.
   * - Solde : TTC du solde restant dû (`amountDue`).
   */
  totalTtc: number;

  // ── Acompte ──────────────────────────────────────────────────────────────────
  /** Pourcentage d'acompte (ex : 30) */
  acomptePercentage?: number;
  /** Montant HT de l'acompte = subtotalHt × acomptePercentage / 100 */
  acompteHt?: number;
  /** TVA sur l'acompte = totalTax × acomptePercentage / 100 */
  acompteTax?: number;

  // ── Solde ────────────────────────────────────────────────────────────────────
  /** Montant HT du solde restant = subtotalHt × (amountDue / totalTtcFull) */
  soldeHt?: number;
  /** TVA sur le solde */
  soldeTax?: number;

  // ── Remise globale ───────────────────────────────────────────────────────────
  /**
   * Total HT brut des lignes, AVANT remise globale.
   * Si absent, on utilise subtotalHt (cas sans remise).
   */
  subtotalBeforeDiscountHt?: number;
  /**
   * Montant de la remise globale à déduire du HT.
   * Si 0 ou absent, les lignes REMISE + TOTAL HT APRÈS REMISE ne s'affichent pas.
   */
  globalDiscountAmount?: number;
  /** Libellé de la remise affiché sur le document (ex : "REMISE 10%"). */
  globalDiscountLabel?: string;

  // ── Conditions (proforma) ────────────────────────────────────────────────────
  /** Délai de livraison */
  deliveryDelay?: string;
  /** Garantie */
  warranty?: string;
  /** Modalité de paiement (proforma) / Conditions générales (facture) */
  paymentConditions?: string;

  currency: string;
  notes?: string;

  /** Surcharge optionnelle : image header en base64 (depuis DB headerImagePath) */
  headerImageB64?: string;
  /** Surcharge optionnelle : image footer en base64 (depuis DB footerImagePath) */
  footerImageB64?: string;
  /** Surcharge optionnelle : image cachet en base64 (depuis DB stampPath) */
  sealImageB64?: string;
  /**
   * Hauteur en px de la zone protégée en bas du footer (infos entreprise).
   * Le contenu peut chevaucher la partie décorative haute du footer,
   * mais jamais cette zone. Si omis, tout le footer est protégé.
   */
  footerSafeZonePx?: number;
}

// ─── Constantes visuelles ─────────────────────────────────────────────────────

/** Bleu BTS (headers / labels de tableaux) */
const BLUE   = '#2196F3';
/** Beige/tan BTS (lignes de totaux) */
const TAN    = '#C8B87A';
/** Couleur de bordure des tableaux */
const BORDER = '#d4d4d4';

// ─── Template HTML ────────────────────────────────────────────────────────────

/**
 * Construit le HTML complet d'un document commercial selon la charte graphique
 * officielle Bridge Technologies Solutions.
 *
 * Les images de header, footer et cachet sont chargées depuis `COMPANY_ASSETS_DIR`
 * et intégrées en base64 dans le HTML.
 *
 * Les montants sont formatés en franc CFA (0 décimale, séparateur espace) conformément
 * aux usages SYSCOHADA.
 *
 * @param params - Données du document (voir `DocumentHtmlParams`)
 * @returns HTML complet prêt à être passé à `generatePdf()`
 */
export function buildDocumentHtml(params: DocumentHtmlParams): string {
  const headerImg = params.headerImageB64 ?? getHeader();
  const footerImg = params.footerImageB64 ?? getFooter();
  const sealImg   = params.type === 'Proforma' ? (params.sealImageB64 ?? getSeal()) : '';

  const isProforma = params.type === 'Proforma';
  const isAcompte  = params.type === 'Facture Acompte';
  const isSolde    = params.type === 'Facture Solde';
  const isFacture  = !isProforma;

  // Mode service : si toutes les lignes sont en mode service, tableau simplifié
  const allService = params.lines.length > 0 && params.lines.every(l => l.hideDetails);

  // Colonne Remise ligne : affichée seulement si au moins une ligne a une remise
  const hasLineDiscount = !allService && params.lines.some(l => !!l.discountLabel);

  /** Nombre de colonnes dans le tableau de lignes */
  // Mode service tout : 2 cols (Désignation + PT)
  // Mode normal proforma sans remise : 4 cols (Désignation + PU + Qté + PT)
  // Mode normal proforma avec remise : 5 cols (Désignation + PU + Qté + Remise + PT)
  // Mode normal facture sans remise  : 5 cols (Ref + Désignation + PU + Qté + PT)
  // Mode normal facture avec remise  : 6 cols (Ref + Désignation + PU + Qté + Remise + PT)
  const nbCols = allService ? 2 : (isProforma ? (hasLineDiscount ? 5 : 4) : (hasLineDiscount ? 6 : 5));

  /** Formateur monétaire SYSCOHADA : 1 500 000 (sans décimale, espace milliers) */
  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

  // ── Styles partagés ──────────────────────────────────────────────────────────
  const cellBorder = `border:1px solid ${BORDER};`;
  const td         = `${cellBorder}padding:5px 8px;background:transparent;`;
  const labelTd    = `${td}background:${BLUE};color:#fff;font-weight:bold;`;
  const thStyle    = `background:${BLUE};color:#fff;font-weight:bold;padding:6px 8px;${cellBorder}`;
  const totalTd    = `background:${TAN};${cellBorder}padding:6px 8px;font-weight:bold;text-align:center;`;
  const totalTdVal = `background:${TAN};${cellBorder}padding:6px 8px;font-weight:bold;text-align:right;`;

  // ── Lignes du tableau ────────────────────────────────────────────────────────
  // La colonne "Désignation" affiche la description riche (HTML) si présente,
  // sinon le titre court (designation). Le HTML est injecté tel quel pour
  // que Puppeteer/Chromium interprète gras, italique, listes, etc.
  //
  // Mode service (hideDetails=true) : Ref/PU/Qté masqués — PT = netHt de la prestation.
  // Mode mixte : les lignes service fusionnent leurs cellules (colspan) avec texte centré.
  const linesRows = params.lines.map(l => {
    const isService = !!l.hideDetails;
    if (allService) {
      // Tableau simplifié : Désignation | PT seulement
      return `
        <tr>
          <td style="${td}">${l.description || l.designation}</td>
          <td style="${td}text-align:right;">${fmt(l.netHt)}</td>
        </tr>`;
    }
    if (isService) {
      // Mode service en tableau mixte : fusionner toutes colonnes sauf PT
      // Le colspan tient compte de la colonne Remise si elle est active
      const serviceColspan = nbCols - 1;
      return `
        <tr>
          <td colspan="${serviceColspan}" style="${td}">${l.description || l.designation}</td>
          <td style="${td}text-align:right;">${fmt(l.netHt)}</td>
        </tr>`;
    }
    // Cellule Remise : valeur colorée si remise, tiret grisé sinon
    const remiseCell = hasLineDiscount
      ? `<td style="${td}text-align:center;${l.discountLabel ? 'color:#ef4444;font-weight:600;' : 'color:#aaa;'}">${l.discountLabel ?? '—'}</td>`
      : '';
    return `
      <tr>
        ${isFacture ? `<td style="${td}text-align:center;">${l.reference ?? '-'}</td>` : ''}
        <td style="${td}">${l.description || l.designation}</td>
        <td style="${td}text-align:right;">${fmt(l.unitPriceHt)}</td>
        <td style="${td}text-align:center;">${String(l.quantity) + (l.unit ? `&nbsp;<span style="font-size:9px;color:#666;">${l.unit}</span>` : '')}</td>
        ${remiseCell}
        <td style="${td}text-align:right;">${fmt(l.netHt)}</td>
      </tr>`;
  }).join('');

  // ── Lignes de totaux ─────────────────────────────────────────────────────────
  const span = nbCols - 1; // colspan pour les labels de total
  let totalRows = '';

  // Remise globale : si présente, on affiche la ligne de remise + TOTAL HT APRÈS REMISE
  const hasDiscount     = (params.globalDiscountAmount ?? 0) > 0;
  const htBrut          = params.subtotalBeforeDiscountHt ?? params.subtotalHt;
  const discountLabel   = params.globalDiscountLabel ?? 'REMISE';
  const discountRows    = hasDiscount ? `
      <tr>
        <td colspan="${span}" style="${totalTd}">${discountLabel}</td>
        <td style="${totalTdVal}">-${fmt(params.globalDiscountAmount!)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}">TOTAL HT APRÈS REMISE</td>
        <td style="${totalTdVal}">${fmt(params.subtotalHt)}</td>
      </tr>` : '';

  if (isAcompte && params.acomptePercentage != null && params.acompteHt != null && params.acompteTax != null) {
    totalRows = `
      <tr>
        <td colspan="${span}" style="${totalTd}">TOTAL HT</td>
        <td style="${totalTdVal}">${fmt(htBrut)}</td>
      </tr>
      ${discountRows}
      <tr>
        <td colspan="${span}" style="${totalTd}">ACOMPTE HT ${params.acomptePercentage.toFixed(2)}%</td>
        <td style="${totalTdVal}">${fmt(params.acompteHt)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}">TVA SUR ACOMPTE 19.25%</td>
        <td style="${totalTdVal}">${fmt(params.acompteTax)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}font-size:13px;">TOTAL TTC</td>
        <td style="${totalTdVal}font-size:13px;">${fmt(params.totalTtc)}</td>
      </tr>`;

  } else if (isSolde && params.soldeHt != null && params.soldeTax != null) {
    totalRows = `
      <tr>
        <td colspan="${span}" style="${totalTd}">TOTAL HT</td>
        <td style="${totalTdVal}">${fmt(htBrut)}</td>
      </tr>
      ${discountRows}
      <tr>
        <td colspan="${span}" style="${totalTd}">SOLDE HT</td>
        <td style="${totalTdVal}">${fmt(params.soldeHt)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}">TVA SUR SOLDE 19.25%</td>
        <td style="${totalTdVal}">${fmt(params.soldeTax)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}font-size:13px;">TOTAL TTC</td>
        <td style="${totalTdVal}font-size:13px;">${fmt(params.totalTtc)}</td>
      </tr>`;

  } else {
    totalRows = `
      <tr>
        <td colspan="${span}" style="${totalTd}">TOTAL HT</td>
        <td style="${totalTdVal}">${fmt(htBrut)}</td>
      </tr>
      ${discountRows}
      <tr>
        <td colspan="${span}" style="${totalTd}">TVA 19.25%</td>
        <td style="${totalTdVal}">${fmt(params.totalTax)}</td>
      </tr>
      <tr>
        <td colspan="${span}" style="${totalTd}font-size:13px;">TOTAL TTC</td>
        <td style="${totalTdVal}font-size:13px;">${fmt(params.totalTtc)}</td>
      </tr>`;
  }

  // ── Section titre + méta ─────────────────────────────────────────────────────
  let titleSection = '';

  if (isProforma) {
    // Titre centré puis table des métadonnées
    titleSection = `
      <div style="text-align:center;margin:18px 0 16px;">
        <h1 style="font-size:16px;font-weight:bold;text-decoration:underline;letter-spacing:1px;display:inline-block;color:${BLUE};">PROFORMA</h1>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
        <tr><td style="${labelTd}width:28%;">Client</td>
            <td style="${td}font-weight:bold;">${params.clientName}</td></tr>
        <tr><td style="${labelTd}">Date</td>
            <td style="${td}">${params.issueDate}</td></tr>
        ${params.subject ? `<tr><td style="${labelTd}">Service</td>
            <td style="${td}">${params.subject}</td></tr>` : ''}
        <tr><td style="${labelTd}">Référence Cotation</td>
            <td style="${td}">${params.number}</td></tr>
        ${params.validUntil ? `<tr><td style="${labelTd}">Valide jusqu'au</td>
            <td style="${td}">${params.validUntil}</td></tr>` : ''}
      </table>`;

  } else if (isAcompte || isSolde) {
    // Layout référence BTS :
    //  1. Titre + N°/Date alignés à DROITE en haut
    //  2. Table client en dessous à GAUCHE (~60% largeur)
    const titleLabel = isAcompte ? 'FACTURE ACOMPTE' : 'FACTURE SOLDE';
    titleSection = `
      <div style="text-align:right;margin:14px 0 10px;">
        <h1 style="font-size:17px;font-weight:bold;text-decoration:underline;letter-spacing:1px;display:inline-block;">${titleLabel}</h1>
        <p style="font-size:11px;margin-top:6px;"><strong>N° Facture :</strong>&nbsp;&nbsp;${params.number}</p>
        <p style="font-size:11px;margin-top:3px;"><strong>Date :</strong>&nbsp;&nbsp;${params.issueDate}</p>
        ${params.dueDate ? `<p style="font-size:11px;margin-top:3px;"><strong>Échéance :</strong>&nbsp;&nbsp;${params.dueDate}</p>` : ''}
      </div>
      <table style="width:60%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
        <tr><td style="${labelTd}text-align:center;width:22%;">Client</td>
            <td style="${td}font-weight:bold;">${params.clientName}</td></tr>
        ${params.clientStreet ? `<tr><td style="${labelTd}text-align:center;">Rue</td>
            <td style="${td}">${params.clientStreet}</td></tr>` : ''}
        ${params.clientBP ? `<tr><td style="${labelTd}text-align:center;">B.P.</td>
            <td style="${td}">${params.clientBP}</td></tr>` : ''}
        ${params.clientPhone ? `<tr><td style="${labelTd}text-align:center;">Tel</td>
            <td style="${td}">${params.clientPhone}</td></tr>` : ''}
        ${params.clientTaxNumber ? `<tr><td style="${labelTd}text-align:center;">NIU</td>
            <td style="${td}">${params.clientTaxNumber}</td></tr>` : ''}
        ${params.clientRccm ? `<tr><td style="${labelTd}text-align:center;">RCCM</td>
            <td style="${td}">${params.clientRccm}</td></tr>` : ''}
      </table>`;

  } else {
    // FACTURE standard ou AVOIR : titre + N°/Date centrés, puis table client pleine largeur
    const titleLabel = params.type === 'Avoir' ? 'AVOIR' : 'FACTURE';
    titleSection = `
      <div style="text-align:center;margin:18px 0 14px;">
        <h1 style="font-size:16px;font-weight:bold;text-decoration:underline;letter-spacing:1px;display:inline-block;">${titleLabel}</h1>
        <p style="font-size:11px;margin-top:6px;"><strong>N° Facture :</strong> ${params.number}</p>
        <p style="font-size:11px;margin-top:3px;"><strong>Date de facturation :</strong> ${params.issueDate}</p>
        ${params.dueDate ? `<p style="font-size:11px;margin-top:3px;"><strong>Échéance :</strong> ${params.dueDate}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
        <tr><td style="${labelTd}width:24%;">Client</td>
            <td style="${td}font-weight:bold;">${params.clientName}</td></tr>
        ${params.clientStreet ? `<tr><td style="${labelTd}">Rue</td>
            <td style="${td}">${params.clientStreet}</td></tr>` : ''}
        ${params.clientBP ? `<tr><td style="${labelTd}">B.P.</td>
            <td style="${td}">${params.clientBP}</td></tr>` : ''}
        ${params.clientPhone ? `<tr><td style="${labelTd}">Tel</td>
            <td style="${td}">${params.clientPhone}</td></tr>` : ''}
        ${params.clientTaxNumber ? `<tr><td style="${labelTd}">NIU</td>
            <td style="${td}">${params.clientTaxNumber}</td></tr>` : ''}
        ${params.clientRccm ? `<tr><td style="${labelTd}">RCCM</td>
            <td style="${td}">${params.clientRccm}</td></tr>` : ''}
      </table>`;
  }

  // ── Tableau des lignes ───────────────────────────────────────────────────────
  // Les largeurs se réduisent légèrement quand la colonne Remise est active
  const desigWidth = isProforma
    ? (hasLineDiscount ? '46%' : '56%')
    : (hasLineDiscount ? '36%' : '44%');
  const puWidth    = isProforma
    ? (hasLineDiscount ? '12%' : '13%')
    : (hasLineDiscount ? '11%' : '12%');
  const qtWidth    = isProforma
    ? (hasLineDiscount ? '11%' : '14%')
    : (hasLineDiscount ? '10%' : '13%');
  const rmWidth    = '12%';   // colonne Remise (fixe)
  const ptWidth    = '13%';
  const refWidth   = hasLineDiscount ? '12%' : '14%';

  const linesTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
      <thead>
        <tr>
          ${allService ? '' : (isFacture ? `<th style="${thStyle}text-align:center;width:${refWidth};">Référence</th>` : '')}
          <th style="${thStyle}text-align:left;${allService ? 'width:82%;' : `width:${desigWidth};`}">Désignation</th>
          ${allService ? '' : `<th style="${thStyle}text-align:right;width:${puWidth};">PU</th>`}
          ${allService ? '' : `<th style="${thStyle}text-align:center;width:${qtWidth};">Qté / Unité</th>`}
          ${hasLineDiscount ? `<th style="${thStyle}text-align:center;width:${rmWidth};">Remise</th>` : ''}
          <th style="${thStyle}text-align:right;width:${ptWidth};">PT</th>
        </tr>
      </thead>
      <tbody>
        ${linesRows}
      </tbody>
      <tbody style="break-inside:avoid;page-break-inside:avoid;">
        ${totalRows}
      </tbody>
    </table>`;

  // ── Section bas (conditions proforma ou infos paiement facture) ──────────────
  let bottomSection = '';

  if (isProforma) {
    const hasConditions = params.deliveryDelay || params.warranty || params.paymentConditions;
    if (hasConditions) {
      bottomSection += `
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;">
          ${params.deliveryDelay     ? `<tr><td style="${labelTd}width:28%;">Délai de livraison</td>
              <td style="${td}">${params.deliveryDelay}</td></tr>` : ''}
          ${params.warranty          ? `<tr><td style="${labelTd}">Garantie</td>
              <td style="${td}">${params.warranty}</td></tr>` : ''}
          ${params.paymentConditions ? `<tr><td style="${labelTd}">Modalité de Paiement</td>
              <td style="${td}">${params.paymentConditions}</td></tr>` : ''}
        </table>`;
    }
    // Cachet et signature (proforma uniquement)
    if (sealImg) {
      bottomSection += `
        <div style="text-align:right;margin-top:10px;padding-right:30px;">
          <div style="display:inline-block;text-align:center;width:180px;">
            <p style="font-weight:bold;font-size:12px;margin-bottom:12px;text-decoration:underline;">Le Service Commercial</p>
            <img src="${sealImg}" style="width:180px;" alt="cachet BTS" />
          </div>
        </div>`;
    }
  } else {
    // Table des informations de paiement
    if (params.clientBankAccount || params.contactPerson) {
      bottomSection = `
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px;">
          ${params.clientBankAccount ? `<tr>
              <td style="${labelTd}width:34%;">Compte ${params.clientName}</td>
              <td style="${td}">${params.clientBankAccount}</td></tr>` : ''}
          ${params.contactPerson     ? `<tr>
              <td style="${labelTd}">Personne à contacter</td>
              <td style="${td}">${params.contactPerson}</td></tr>` : ''}
        </table>`;
    }
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  // background:white sur les notes : elles peuvent se trouver en bas de page dans
  // la zone décorative du footer (background du body) — le fond blanc les rend lisibles.
  const notesSection = params.notes
    ? `<p style="font-size:10px;color:#555;margin-top:10px;font-style:italic;background:white;padding:2px 0;">${params.notes}</p>`
    : '';

  // ── Assemblage final ─────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #333;
    width: 210mm;
  }
  /* Header : mesure des hauteurs dans generatePdf(), puis masqué et injecté
     via headerTemplate (répétition sur chaque page).
     Footer : masqué + appliqué comme background du body (background-attachment:fixed)
     → se répète sur chaque page, le contenu s'affiche par-dessus. */
  .page-header img { width: 100%; display: block; }
  .page-footer img { width: 100%; display: block; }
  /* Pas de background sur .page-content : les zones vides laissent voir le
     background body (image footer). Les td ont background:white explicite. */
  .page-content { padding: 5mm 14mm; position: relative; z-index: 1; }

  /* En-têtes de colonnes répétés sur chaque page lors de la pagination */
  thead { display: table-header-group; }

  /* Listes dans les cellules de description : puces/numéros restent dans la cellule */
  td ul, td ol { list-style-position: inside; padding-left: 4px; margin: 2px 0; }
  td li { margin: 1px 0; }
</style>
</head>
<body>
  <div class="page-header">
    ${headerImg ? `<img src="${headerImg}" alt="" />` : ''}
  </div>

  <!-- footer avant content : le content (plus tard dans le DOM) est naturellement
       au-dessus du footer via le stacking CSS, sans z-index explicite.
       La marge Puppeteer bottom protège la zone des infos entreprise en bas. -->
  <div class="page-footer">
    ${footerImg ? `<img src="${footerImg}" alt="" />` : ''}
  </div>

  <div class="page-content">
    ${titleSection}
    ${linesTable}
    ${bottomSection}
    ${notesSection}
  </div>
</body>
</html>`;
}

// ─── Reçu de paiement ─────────────────────────────────────────────────────────

/** Paramètres de construction du template HTML d'un reçu de paiement BTS. */
export interface ReceiptParams {
  /** Référence du paiement ou numéro auto (ex : REC-A3F2C1B0) */
  receiptRef: string;
  /** Date de paiement formatée fr-FR */
  paymentDate: string;
  /** Montant encaissé */
  amount: number;
  /** Méthode de paiement (cash, bank_transfer, check, mobile_money, other) */
  method: string;
  /** Référence bancaire / chèque (optionnel) */
  reference?: string;
  /** N° facture associée */
  invoiceNumber: string;
  /** Total TTC de la facture */
  invoiceTotalTtc: number;
  /** Total encaissé sur la facture après ce paiement */
  amountPaid: number;
  /** Solde restant après ce paiement */
  balanceDue: number;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  /** Devise (ex : XAF) */
  currency: string;
  notes?: string;
  /** Header en base64 (surcharge optionnelle) */
  headerImageB64?: string;
  /** Footer en base64 (surcharge optionnelle) */
  footerImageB64?: string;
  /** Cachet en base64 (surcharge optionnelle) */
  sealImageB64?: string;
}

/**
 * Construit le HTML complet d'un reçu de paiement selon la charte graphique BTS.
 *
 * @param params - Données du reçu (voir `ReceiptParams`)
 * @returns HTML complet prêt à être passé à `generatePdf()`
 */
export function buildReceiptHtml(params: ReceiptParams): string {
  const headerImg = params.headerImageB64 ?? getHeader();
  const footerImg = params.footerImageB64 ?? getFooter();
  const sealImg   = params.sealImageB64   ?? getSeal();

  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

  const BLUE_R   = '#2196F3';
  const TAN_R    = '#C8B87A';
  const BORDER_R = '#d4d4d4';
  const td_r     = `border:1px solid ${BORDER_R};padding:6px 10px;`;
  const labelTd_r = `${td_r}background:${BLUE_R};color:#fff;font-weight:bold;width:35%;`;
  const totalTd_r = `background:${TAN_R};border:1px solid ${BORDER_R};padding:6px 10px;font-weight:bold;`;

  // Conversion méthode en français
  const methodLabels: Record<string, string> = {
    cash: 'Espèces', bank_transfer: 'Virement bancaire',
    check: 'Chèque', mobile_money: 'Mobile Money', other: 'Autre',
  };
  const methodLabel = methodLabels[params.method] ?? params.method;

  const amountStr = `${fmt(params.amount)} ${params.currency}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; width: 210mm; }
  .page-header img { width: 100%; display: block; }
  .page-footer img { width: 100%; display: block; }
  .page-content { padding: 5mm 14mm; position: relative; z-index: 1; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="page-header">${headerImg ? `<img src="${headerImg}" alt="" />` : ''}</div>
  <div class="page-footer">${footerImg ? `<img src="${footerImg}" alt="" />` : ''}</div>
  <div class="page-content">
    <div style="text-align:center;margin:18px 0 20px;">
      <h1 style="font-size:16px;font-weight:bold;text-decoration:underline;letter-spacing:1px;display:inline-block;">REÇU DE PAIEMENT</h1>
      <p style="font-size:11px;margin-top:6px;"><strong>Référence :</strong> ${params.receiptRef}</p>
      <p style="font-size:11px;margin-top:3px;"><strong>Date :</strong> ${params.paymentDate}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
      <tr><td style="${labelTd_r}">Client</td><td style="${td_r}font-weight:bold;">${params.clientName}</td></tr>
      ${params.clientPhone ? `<tr><td style="${labelTd_r}">Téléphone</td><td style="${td_r}">${params.clientPhone}</td></tr>` : ''}
      ${params.clientEmail ? `<tr><td style="${labelTd_r}">Email</td><td style="${td_r}">${params.clientEmail}</td></tr>` : ''}
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;">
      <tr><td style="${labelTd_r}">Facture N°</td><td style="${td_r}">${params.invoiceNumber}</td></tr>
      <tr><td style="${labelTd_r}">Montant encaissé</td><td style="${td_r}font-weight:bold;font-size:13px;">${fmt(params.amount)} ${params.currency}</td></tr>
      <tr><td style="${labelTd_r}">Mode de règlement</td><td style="${td_r}">${methodLabel}</td></tr>
      ${params.reference ? `<tr><td style="${labelTd_r}">Référence</td><td style="${td_r}">${params.reference}</td></tr>` : ''}
      <tr><td colspan="2" style="${totalTd_r}text-align:center;">Total facture : ${fmt(params.invoiceTotalTtc)} ${params.currency} &nbsp;|&nbsp; Déjà encaissé : ${fmt(params.amountPaid)} ${params.currency} &nbsp;|&nbsp; Solde restant : ${fmt(params.balanceDue)} ${params.currency}</td></tr>
    </table>

    <p style="font-size:11px;margin-bottom:20px;font-style:italic;">
      Arrêté le présent reçu à la somme de <strong>${amountStr}</strong>
      ${params.balanceDue <= 0 ? ', solde entièrement réglé.' : ', solde restant dû.'}
    </p>

    ${params.notes ? `<p style="font-size:10px;color:#555;margin-bottom:16px;">${params.notes}</p>` : ''}

    <div style="text-align:right;margin-top:16px;margin-right:20px;">
      <p style="font-weight:bold;font-size:12px;margin-bottom:10px;">La Caisse</p>
      ${sealImg ? `<img src="${sealImg}" style="width:160px;" alt="cachet BTS" />` : ''}
    </div>
  </div>
</body>
</html>`;
}

