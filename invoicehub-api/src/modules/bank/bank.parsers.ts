import { default as iconv } from 'iconv-lite';
import * as crypto from 'crypto';
import { BankProfile, BANK_PROFILES } from './bank.profiles';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  transactionDate: Date;
  valueDate?: Date;
  label: string;
  amount: number;
  type: 'debit' | 'credit';
  reference?: string;
  balanceAfter?: number;
  contentHash: string;
  rawRow: Record<string, string>;
}

export interface DetectedFormat {
  profileId: string | null;
  profileName: string;
  delimiter: ',' | ';' | '\t' | '|';
  encoding: string;
  dateFormat: string;
  numberFormat: { thousands: string; decimal: string };
  columnMapping: {
    date: string;
    label: string;
    debit?: string;
    credit?: string;
    amount?: string;
    direction?: string;
    reference?: string;
    balanceAfter?: string;
    valueDate?: string;
  };
  amountSign?: 'negative-is-debit' | 'positive-is-credit';
  directionValues?: { debit: string[]; credit: string[] };
  skipRowsContaining?: string[];
  confidence: number;
  source: 'estimated' | 'community' | 'verified' | 'override' | 'auto-detected';
  verificationNote?: string;
  headerRow: number;
}

export interface ImportPreview {
  detectedFormat: DetectedFormat;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  /** Toutes les transactions valides — utilisé par confirmImport() */
  sampleTransactions: ParsedTransaction[];
  /** Premières 5 transactions — pour l'affichage frontend uniquement */
  sampleRows: ParsedTransaction[];
  errors: Array<{ row: number; message: string }>;
  dateRange: { min: Date | null; max: Date | null };
  totalDebits: number;
  totalCredits: number;
}

// ── Décodage encodage ─────────────────────────────────────────────────────────

export function decodeBuffer(
  buffer: Buffer,
  hint: 'auto' | 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le' = 'auto'
): string {
  if (hint !== 'auto') return iconv.decode(buffer, hint);

  // BOM UTF-8 : EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.slice(3).toString('utf-8');
  }
  // BOM UTF-16 LE : FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return iconv.decode(buffer.slice(2), 'utf-16le');
  }
  // Essai UTF-8 — si caractères de remplacement → Windows-1252
  const utf8 = buffer.toString('utf-8');
  if (utf8.includes('�')) return iconv.decode(buffer, 'win1252');
  return utf8;
}

// ── Détection du délimiteur ───────────────────────────────────────────────────

export function detectDelimiter(firstLine: string): ',' | ';' | '\t' | '|' {
  const counts: Record<string, number> = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
    '|': (firstLine.match(/\|/g) ?? []).length,
  };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]) as any;
}

// ── Normalisation des headers ─────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  date:         ['date', 'dt', 'date operation', 'date ope', 'transaction date',
                 'date val', 'posting date', 'value date', 'dt ope', 'date operaton'],
  label:        ['libelle', 'label', 'description', 'detail', 'motif', 'objet',
                 'narration', 'reference libelle', 'intitule', 'details', 'particulars'],
  debit:        ['debit', 'montant debit', 'withdrawal', 'withdrawals', 'sortie',
                 'charge', 'dr', 'mouvement debiteur', 'debit amount'],
  credit:       ['credit', 'montant credit', 'deposit', 'deposits', 'entree',
                 'versement', 'cr', 'mouvement crediteur', 'credit amount'],
  amount:       ['montant', 'amount', 'valeur', 'mouvement'],
  direction:    ['sens', 'type', 'dr cr', 'd c', 'nature', 'sens operation', 'dr_cr'],
  reference:    ['reference', 'ref', 'numero', 'id', 'fitid', 'numero operation', 'no'],
  balanceAfter: ['solde', 'balance', 'solde progressif', 'running balance',
                 'solde apres', 'new balance', 'ledger balance'],
  valueDate:    ['date valeur', 'date val', 'dt val', 'value date'],
};

// ── Détection automatique du mapping des colonnes ─────────────────────────────

export function detectColumnMapping(
  headers: string[]
): Record<string, string> {
  const normalized = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));
  const result: Record<string, string> = {};

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const { original, normalized: norm } of normalized) {
      if (synonyms.includes(norm)) {
        result[field] = original;
        break;
      }
    }
  }

  return result;
}

// ── Détection du format de date ───────────────────────────────────────────────

function detectDateFormat(sample: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return 'YYYY-MM-DD';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) return 'DD/MM/YYYY';
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(sample)) return 'DD/MM/YY';
  if (/^\d{2}-\d{2}-\d{4}$/.test(sample)) return 'DD-MM-YYYY';
  if (/^[A-Za-z]{3}\s+\d{1,2}\s+\d{4}$/.test(sample)) return 'MMM DD YYYY';
  return 'DD/MM/YYYY'; // fallback
}

// ── Détection du format numérique ─────────────────────────────────────────────

function detectNumberFormat(sample: string): { thousands: string; decimal: string } {
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(sample)) return { thousands: '.', decimal: ',' };
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(sample)) return { thousands: ',', decimal: '.' };
  if (/^\d{1,3}( \d{3})*(,\d+)?$/.test(sample)) return { thousands: ' ', decimal: ',' };
  return { thousands: '', decimal: '.' };
}

// ── Score de correspondance avec un profil ────────────────────────────────────

function scoreProfile(profile: BankProfile, headers: string[], sampleRows: string[][]): number {
  let score = 0;

  // Correspondance colonnes
  const normalizedHeaders = headers.map(h => normalizeHeader(h));
  const profileCols = Object.values(profile.columns).flat();
  for (const col of profileCols) {
    if (normalizedHeaders.includes(normalizeHeader(col))) score += 10;
  }

  // Bonus si toutes les colonnes critiques trouvées
  const dateCols = [profile.columns.date].flat();
  const labelCols = [profile.columns.label].flat();
  const hasDate  = dateCols.some(c => normalizedHeaders.includes(normalizeHeader(c)));
  const hasLabel = labelCols.some(c => normalizedHeaders.includes(normalizeHeader(c)));
  if (hasDate && hasLabel) score += 20;

  // Bonus source
  if (profile.source === 'verified')   score += 30;
  if (profile.source === 'community')  score += 10;

  return score;
}

// ── Sélection du meilleur profil ─────────────────────────────────────────────

export function selectBestProfile(
  headers: string[],
  sampleRows: string[][],
  overrideProfileData?: any
): { profile: BankProfile | null; confidence: number } {
  if (overrideProfileData) {
    return { profile: overrideProfileData as BankProfile, confidence: 100 };
  }

  let bestScore = 0;
  let bestProfile: BankProfile | null = null;

  for (const profile of BANK_PROFILES) {
    const score = scoreProfile(profile, headers, sampleRows);
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  const confidence = Math.min(100, Math.round((bestScore / 80) * 100));
  return { profile: bestProfile, confidence };
}

// ── Parser une ligne CSV (gestion des guillemets) ─────────────────────────────

export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Parser une date ───────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fev: 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6,
  juil: 7, aout: 8, sept: 9, octo: 10, nove: 11, dece: 12,
};

export function parseDate(raw: string, format: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  try {
    if (format === 'YYYY-MM-DD') {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y!, m! - 1, d!);
    }
    if (format === 'DD/MM/YYYY') {
      const [d, m, y] = s.split('/').map(Number);
      return new Date(y!, m! - 1, d!);
    }
    if (format === 'DD/MM/YY') {
      const [d, m, y] = s.split('/').map(Number);
      return new Date(2000 + y!, m! - 1, d!);
    }
    if (format === 'MM/DD/YYYY') {
      const [m, d, y] = s.split('/').map(Number);
      return new Date(y!, m! - 1, d!);
    }
    if (format === 'DD-MM-YYYY') {
      const [d, m, y] = s.split('-').map(Number);
      return new Date(y!, m! - 1, d!);
    }
    if (format === 'MMM DD YYYY') {
      const parts = s.split(/\s+/);
      const month = MONTH_NAMES[parts[0]!.toLowerCase().slice(0, 4)] ?? 1;
      return new Date(Number(parts[2]), month - 1, Number(parts[1]));
    }
  } catch {
    return null;
  }

  return new Date(s);
}

// ── Parser un montant ─────────────────────────────────────────────────────────

export function parseAmount(raw: string, thousands: string, decimal: string): number | null {
  if (!raw || raw.trim() === '') return null;
  let s = raw.trim().replace(/\s/g, '');

  if (thousands && thousands !== ' ') {
    s = s.split(thousands).join('');
  } else if (thousands === ' ') {
    s = s.replace(/ /g, '');
  }
  if (decimal !== '.') {
    s = s.replace(decimal, '.');
  }
  s = s.replace(/[^\d.\-]/g, '');

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Calcul du contentHash ─────────────────────────────────────────────────────

export function computeContentHash(
  bankAccountId: string,
  date: Date,
  amount: number,
  type: 'debit' | 'credit',
  label: string
): string {
  const normalized = label.toLowerCase().trim().replace(/\s+/g, ' ');
  const dateStr = date.toISOString().slice(0, 10);
  const payload = `${bankAccountId}|${dateStr}|${amount}|${type}|${normalized}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ── Détection automatique du format complet ───────────────────────────────────

export function autoDetectFormat(
  content: string,
  overrideProfileData?: any
): DetectedFormat {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) throw new Error('Fichier vide');

  // Chercher la ligne d'en-tête (première ligne non vide avec plusieurs colonnes)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if ((lines[i]!.match(/;/g) ?? []).length >= 2 ||
        (lines[i]!.match(/,/g) ?? []).length >= 2 ||
        (lines[i]!.match(/\|/g) ?? []).length >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  const delimiter = detectDelimiter(lines[headerRowIndex]!);
  const headers = parseCsvLine(lines[headerRowIndex]!, delimiter);

  // Lignes de données (quelques échantillons)
  const sampleRows = lines
    .slice(headerRowIndex + 1, headerRowIndex + 6)
    .map(l => parseCsvLine(l, delimiter));

  const { profile, confidence } = selectBestProfile(headers, sampleRows, overrideProfileData);

  let columnMapping: DetectedFormat['columnMapping'];
  let dateFormat = 'DD/MM/YYYY';
  let numberFormat = { thousands: ' ', decimal: ',' };
  let amountSign: DetectedFormat['amountSign'];
  let directionValues: DetectedFormat['directionValues'];
  let skipRowsContaining: string[] | undefined;

  if (profile) {
    // Résoudre les colonnes du profil vers les headers réels
    const resolve = (candidates: string | string[]): string | undefined => {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      return list.find(c => headers.some(h => normalizeHeader(h) === normalizeHeader(c)));
    };

    columnMapping = {
      date:         resolve(profile.columns.date) ?? headers[0] ?? 'date',
      label:        resolve(profile.columns.label) ?? headers[1] ?? 'label',
      debit:        profile.columns.debit ? resolve(profile.columns.debit) : undefined,
      credit:       profile.columns.credit ? resolve(profile.columns.credit) : undefined,
      amount:       profile.columns.amount ? resolve(profile.columns.amount) : undefined,
      direction:    profile.columns.direction ? resolve(profile.columns.direction) : undefined,
      reference:    profile.columns.reference ? resolve(profile.columns.reference) : undefined,
      balanceAfter: profile.columns.balanceAfter ? resolve(profile.columns.balanceAfter) : undefined,
      valueDate:    profile.columns.valueDate ? resolve(profile.columns.valueDate) : undefined,
    };
    dateFormat = profile.dateFormat;
    numberFormat = profile.numberFormat;
    amountSign = profile.amountSign;
    directionValues = profile.directionValues;
    skipRowsContaining = profile.skipRowsContaining;
  } else {
    // Auto-détection pure
    const autoMapping = detectColumnMapping(headers);
    columnMapping = {
      date:         autoMapping['date'] ?? headers[0] ?? 'date',
      label:        autoMapping['label'] ?? headers[1] ?? 'label',
      debit:        autoMapping['debit'],
      credit:       autoMapping['credit'],
      amount:       autoMapping['amount'],
      direction:    autoMapping['direction'],
      reference:    autoMapping['reference'],
      balanceAfter: autoMapping['balanceAfter'],
      valueDate:    autoMapping['valueDate'],
    };

    // Détecter format de date et nombre depuis échantillon
    const dateColIndex = headers.indexOf(columnMapping.date);
    if (sampleRows[0] && dateColIndex >= 0) {
      const sampleDate = sampleRows[0][dateColIndex] ?? '';
      dateFormat = detectDateFormat(sampleDate);
    }

    const amountCol = columnMapping.debit ?? columnMapping.credit ?? columnMapping.amount;
    if (amountCol) {
      const amtColIndex = headers.indexOf(amountCol);
      if (sampleRows[0] && amtColIndex >= 0) {
        numberFormat = detectNumberFormat(sampleRows[0][amtColIndex] ?? '');
      }
    }
  }

  return {
    profileId:           profile?.id ?? null,
    profileName:         profile?.name ?? 'Détection automatique',
    delimiter,
    encoding:            profile?.encoding ?? 'utf-8',
    dateFormat,
    numberFormat,
    columnMapping,
    amountSign,
    directionValues,
    skipRowsContaining,
    confidence,
    source:              overrideProfileData ? 'override' : (profile?.source ?? 'auto-detected'),
    verificationNote:    profile?.verificationNote,
    headerRow:           headerRowIndex,
  };
}

// ── Parser complet du fichier CSV ─────────────────────────────────────────────

export function parseCsvContent(
  content: string,
  fmt: DetectedFormat,
  bankAccountId: string,
  existingHashes: Set<string> = new Set()
): ImportPreview {
  const lines = content.split(/\r?\n/);
  const dataLines = lines.slice(fmt.headerRow + 1);
  const { thousands, decimal } = fmt.numberFormat;
  const cm = fmt.columnMapping;

  const preview: ImportPreview = {
    detectedFormat: fmt,
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    duplicateRows: 0,
    sampleTransactions: [], // toutes les transactions valides
    sampleRows: [],         // premières 5 pour affichage
    errors: [],
    dateRange: { min: null, max: null },
    totalDebits: 0,
    totalCredits: 0,
  };

  // Indices des colonnes
  const headerLine = lines[fmt.headerRow] ?? '';
  const headers = parseCsvLine(headerLine, fmt.delimiter);
  const idx = (col: string | undefined) => col ? headers.indexOf(col) : -1;

  const iDate    = idx(cm.date);
  const iLabel   = idx(cm.label);
  const iDebit   = idx(cm.debit);
  const iCredit  = idx(cm.credit);
  const iAmount  = idx(cm.amount);
  const iDir     = idx(cm.direction);
  const iRef     = idx(cm.reference);
  const iBalance = idx(cm.balanceAfter);
  const iValDate = idx(cm.valueDate);

  let rowNum = fmt.headerRow + 2;

  for (const rawLine of dataLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) { rowNum++; continue; }

    // Skip rows contenant des mots-clés à ignorer
    if (fmt.skipRowsContaining?.some(kw => trimmed.includes(kw))) { rowNum++; continue; }

    preview.totalRows++;
    const cols = parseCsvLine(trimmed, fmt.delimiter);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = cols[i] ?? ''; });

    try {
      // Date
      const rawDate = iDate >= 0 ? (cols[iDate] ?? '') : '';
      const txDate = parseDate(rawDate, fmt.dateFormat);
      if (!txDate || isNaN(txDate.getTime())) {
        preview.errors.push({ row: rowNum, message: `Date invalide: "${rawDate}"` });
        preview.errorRows++;
        rowNum++;
        continue;
      }

      // Label
      const label = iLabel >= 0 ? (cols[iLabel] ?? '').trim() : '';
      if (!label) {
        preview.errors.push({ row: rowNum, message: 'Libellé vide' });
        preview.errorRows++;
        rowNum++;
        continue;
      }

      // Montant et type
      let amount = 0;
      let type: 'debit' | 'credit' = 'credit';

      if (iDebit >= 0 || iCredit >= 0) {
        // Mode débit/crédit séparé
        const debitVal  = iDebit >= 0 ? parseAmount(cols[iDebit] ?? '', thousands, decimal) : null;
        const creditVal = iCredit >= 0 ? parseAmount(cols[iCredit] ?? '', thousands, decimal) : null;

        if (debitVal && debitVal > 0) { amount = debitVal; type = 'debit'; }
        else if (creditVal && creditVal > 0) { amount = creditVal; type = 'credit'; }
        else {
          preview.errors.push({ row: rowNum, message: 'Montant nul ou invalide' });
          preview.errorRows++;
          rowNum++;
          continue;
        }
      } else if (iAmount >= 0) {
        // Mode montant unique
        const raw = parseAmount(cols[iAmount] ?? '', thousands, decimal);
        if (raw === null || raw === 0) {
          preview.errors.push({ row: rowNum, message: 'Montant invalide' });
          preview.errorRows++;
          rowNum++;
          continue;
        }
        amount = Math.abs(raw);

        if (iDir >= 0 && fmt.directionValues) {
          const dir = (cols[iDir] ?? '').trim();
          const isDebit = fmt.directionValues.debit.includes(dir);
          type = isDebit ? 'debit' : 'credit';
        } else if (fmt.amountSign === 'negative-is-debit') {
          type = raw < 0 ? 'debit' : 'credit';
        } else {
          type = raw > 0 ? 'credit' : 'debit';
        }
      } else {
        preview.errors.push({ row: rowNum, message: 'Colonnes montant introuvables' });
        preview.errorRows++;
        rowNum++;
        continue;
      }

      // Date de valeur (optionnelle)
      let valueDate: Date | undefined;
      if (iValDate >= 0) {
        const vd = parseDate(cols[iValDate] ?? '', fmt.dateFormat);
        if (vd && !isNaN(vd.getTime())) valueDate = vd;
      }

      // Référence (optionnelle)
      const reference = iRef >= 0 ? (cols[iRef] ?? '').trim() || undefined : undefined;

      // Solde après (optionnel)
      let balanceAfter: number | undefined;
      if (iBalance >= 0) {
        const bv = parseAmount(cols[iBalance] ?? '', thousands, decimal);
        if (bv !== null) balanceAfter = bv;
      }

      // Content hash
      const contentHash = computeContentHash(bankAccountId, txDate, amount, type, label);

      // Doublon détecté
      if (existingHashes.has(contentHash)) {
        preview.duplicateRows++;
        rowNum++;
        continue;
      }

      const tx: ParsedTransaction = {
        transactionDate: txDate,
        valueDate,
        label,
        amount,
        type,
        reference,
        balanceAfter,
        contentHash,
        rawRow: raw,
      };

      preview.validRows++;
      if (type === 'debit') preview.totalDebits += amount;
      else preview.totalCredits += amount;

      if (!preview.dateRange.min || txDate < preview.dateRange.min) preview.dateRange.min = txDate;
      if (!preview.dateRange.max || txDate > preview.dateRange.max) preview.dateRange.max = txDate;

      preview.sampleTransactions.push(tx); // toutes les lignes valides
      if (preview.sampleRows.length < 5) {
        preview.sampleRows.push(tx);       // seulement 5 pour l'affichage
      }
    } catch (e: any) {
      preview.errors.push({ row: rowNum, message: e?.message ?? 'Erreur inconnue' });
      preview.errorRows++;
    }

    rowNum++;
  }

  return preview;
}

// ── Parsing complet (toutes les lignes) ───────────────────────────────────────

export function parseAllTransactions(
  content: string,
  fmt: DetectedFormat,
  bankAccountId: string,
  existingHashes: Set<string> = new Set()
): { transactions: ParsedTransaction[]; errors: Array<{ row: number; message: string }> } {
  const lines = content.split(/\r?\n/);
  const dataLines = lines.slice(fmt.headerRow + 1);
  const { thousands, decimal } = fmt.numberFormat;
  const cm = fmt.columnMapping;

  const headerLine = lines[fmt.headerRow] ?? '';
  const headers = parseCsvLine(headerLine, fmt.delimiter);
  const idx = (col: string | undefined) => col ? headers.indexOf(col) : -1;

  const iDate    = idx(cm.date);
  const iLabel   = idx(cm.label);
  const iDebit   = idx(cm.debit);
  const iCredit  = idx(cm.credit);
  const iAmount  = idx(cm.amount);
  const iDir     = idx(cm.direction);
  const iRef     = idx(cm.reference);
  const iBalance = idx(cm.balanceAfter);
  const iValDate = idx(cm.valueDate);

  const transactions: ParsedTransaction[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  let rowNum = fmt.headerRow + 2;

  for (const rawLine of dataLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) { rowNum++; continue; }
    if (fmt.skipRowsContaining?.some(kw => trimmed.includes(kw))) { rowNum++; continue; }

    const cols = parseCsvLine(trimmed, fmt.delimiter);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = cols[i] ?? ''; });

    try {
      const rawDate = iDate >= 0 ? (cols[iDate] ?? '') : '';
      const txDate = parseDate(rawDate, fmt.dateFormat);
      if (!txDate || isNaN(txDate.getTime())) { rowNum++; continue; }

      const label = iLabel >= 0 ? (cols[iLabel] ?? '').trim() : '';
      if (!label) { rowNum++; continue; }

      let amount = 0;
      let type: 'debit' | 'credit' = 'credit';

      if (iDebit >= 0 || iCredit >= 0) {
        const debitVal  = iDebit >= 0 ? parseAmount(cols[iDebit] ?? '', thousands, decimal) : null;
        const creditVal = iCredit >= 0 ? parseAmount(cols[iCredit] ?? '', thousands, decimal) : null;
        if (debitVal && debitVal > 0) { amount = debitVal; type = 'debit'; }
        else if (creditVal && creditVal > 0) { amount = creditVal; type = 'credit'; }
        else { rowNum++; continue; }
      } else if (iAmount >= 0) {
        const rawAmt = parseAmount(cols[iAmount] ?? '', thousands, decimal);
        if (rawAmt === null || rawAmt === 0) { rowNum++; continue; }
        amount = Math.abs(rawAmt);
        if (iDir >= 0 && fmt.directionValues) {
          const dir = (cols[iDir] ?? '').trim();
          type = fmt.directionValues.debit.includes(dir) ? 'debit' : 'credit';
        } else if (fmt.amountSign === 'negative-is-debit') {
          type = rawAmt < 0 ? 'debit' : 'credit';
        } else {
          type = rawAmt > 0 ? 'credit' : 'debit';
        }
      } else { rowNum++; continue; }

      let valueDate: Date | undefined;
      if (iValDate >= 0) {
        const vd = parseDate(cols[iValDate] ?? '', fmt.dateFormat);
        if (vd && !isNaN(vd.getTime())) valueDate = vd;
      }

      const reference = iRef >= 0 ? (cols[iRef] ?? '').trim() || undefined : undefined;

      let balanceAfter: number | undefined;
      if (iBalance >= 0) {
        const bv = parseAmount(cols[iBalance] ?? '', thousands, decimal);
        if (bv !== null) balanceAfter = bv;
      }

      const contentHash = computeContentHash(bankAccountId, txDate, amount, type, label);

      if (existingHashes.has(contentHash)) { rowNum++; continue; }

      transactions.push({ transactionDate: txDate, valueDate, label, amount, type, reference, balanceAfter, contentHash, rawRow: raw });
    } catch (e: any) {
      errors.push({ row: rowNum, message: e?.message ?? 'Erreur inconnue' });
    }

    rowNum++;
  }

  return { transactions, errors };
}

// ── Format de fichier ─────────────────────────────────────────────────────────

export type FileFormat = 'csv' | 'ofx' | 'mt940' | 'unknown';

export function detectFileFormat(filename: string, content: string): FileFormat {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  if (ext === 'sta' || content.startsWith(':20:')) return 'mt940';
  if (content.includes('<OFX>') || content.includes('OFXHEADER:')) return 'ofx';
  return 'csv';
}

// ── Parser OFX (SGML) ─────────────────────────────────────────────────────────

export function parseOfx(content: string, bankAccountId: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  for (const block of blocks) {
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<\n]+)`, 'i'))?.[1]?.trim() ?? '';
    const dtposted = get('DTPOSTED');
    const trnamt   = parseFloat(get('TRNAMT').replace(',', '.'));
    const name     = get('NAME') || get('MEMO');
    const fitid    = get('FITID');

    if (!dtposted || isNaN(trnamt) || !name) continue;

    const year  = parseInt(dtposted.slice(0, 4));
    const month = parseInt(dtposted.slice(4, 6)) - 1;
    const day   = parseInt(dtposted.slice(6, 8));
    const date  = new Date(year, month, day);
    if (isNaN(date.getTime())) continue;

    const amount = Math.abs(trnamt);
    const type: 'debit' | 'credit' = trnamt >= 0 ? 'credit' : 'debit';

    results.push({
      transactionDate: date,
      label:           name,
      amount,
      type,
      reference:       fitid || undefined,
      contentHash:     computeContentHash(bankAccountId, date, amount, type, name),
      rawRow:          { _raw: block.slice(0, 200) },
    });
  }
  return results;
}

// ── Parser MT940 (SWIFT) ──────────────────────────────────────────────────────

export function parseMt940(content: string, bankAccountId: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith(':61:')) continue;

    const m = line.match(/:61:(\d{6})(\d{4})?(C|D)N?(\d+,\d{2})/);
    if (!m) continue;

    const yy     = parseInt(m[1]!.slice(0, 2));
    const mm     = parseInt(m[1]!.slice(2, 4)) - 1;
    const dd     = parseInt(m[1]!.slice(4, 6));
    const date   = new Date(yy < 50 ? 2000 + yy : 1900 + yy, mm, dd);
    const amount = parseFloat(m[4]!.replace(',', '.'));
    const type: 'debit' | 'credit' = m[3] === 'C' ? 'credit' : 'debit';

    let label = 'Transaction MT940';
    if (lines[i + 1]?.startsWith(':86:')) {
      label = lines[i + 1]!.slice(4).trim();
      i++;
    }

    results.push({
      transactionDate: date,
      label,
      amount,
      type,
      contentHash: computeContentHash(bankAccountId, date, amount, type, label),
      rawRow:      { _raw: line },
    });
  }
  return results;
}

// ── Dispatcher principal ──────────────────────────────────────────────────────

export interface StatementParseResult {
  transactions: ParsedTransaction[];
  errors:       Array<{ row: number; message: string }>;
  detectedFormat: DetectedFormat | null;
  fileFormat:     FileFormat;
  totalDebits:    number;
  totalCredits:   number;
}

export function parseStatementFile(
  buffer: Buffer,
  filename: string,
  bankAccountId: string,
  overrideProfileData?: any,
  encodingHint: 'auto' | 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le' = 'auto'
): StatementParseResult {
  const content    = decodeBuffer(buffer, encodingHint);
  const fileFormat = detectFileFormat(filename, content);

  let transactions: ParsedTransaction[] = [];
  let errors: Array<{ row: number; message: string }> = [];
  let detectedFormat: DetectedFormat | null = null;

  if (fileFormat === 'ofx') {
    transactions = parseOfx(content, bankAccountId);
  } else if (fileFormat === 'mt940') {
    transactions = parseMt940(content, bankAccountId);
  } else {
    detectedFormat = autoDetectFormat(content, overrideProfileData);
    const result   = parseAllTransactions(content, detectedFormat, bankAccountId);
    transactions   = result.transactions;
    errors         = result.errors;
  }

  let totalDebits = 0;
  let totalCredits = 0;
  for (const t of transactions) {
    if (t.type === 'debit') totalDebits  += t.amount;
    else                    totalCredits += t.amount;
  }

  return { transactions, errors, detectedFormat, fileFormat, totalDebits, totalCredits };
}
