import {
  decodeBuffer, detectDelimiter, detectColumnMapping,
  parseDate, parseAmount, computeContentHash,
  detectFileFormat, parseOfx, parseMt940,
  autoDetectFormat, parseAllTransactions, parseCsvContent,
  parseStatementFile,
} from './bank.parsers';

describe('bank.parsers — decodeBuffer', () => {
  it('décode l’UTF-8 avec BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('Café', 'utf-8')]);
    expect(decodeBuffer(buf)).toBe('Café');
  });
  it('décode l’UTF-8 sans BOM', () => {
    expect(decodeBuffer(Buffer.from('Hello world', 'utf-8'))).toBe('Hello world');
  });
  it('bascule sur Windows-1252 quand l’UTF-8 produit un caractère de remplacement', () => {
    // 0xE9 = "é" en Windows-1252, invalide en UTF-8 isolé
    const buf = Buffer.from([0x43, 0x61, 0x66, 0xE9]); // "Caf" + é(win1252)
    expect(decodeBuffer(buf)).toBe('Café');
  });
  it('respecte un hint d’encodage explicite', () => {
    const buf = Buffer.from([0x43, 0x61, 0x66, 0xE9]);
    expect(decodeBuffer(buf, 'win1252')).toBe('Café');
  });
});

describe('bank.parsers — detectDelimiter', () => {
  it('détecte ; , tab et |', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a|b|c')).toBe('|');
  });
  it('choisit le délimiteur le plus fréquent', () => {
    expect(detectDelimiter('a;b;c,d')).toBe(';');
  });
});

describe('bank.parsers — detectColumnMapping', () => {
  it('mappe les en-têtes FR accentués via synonymes', () => {
    const m = detectColumnMapping(['Date', 'Libellé', 'Débit', 'Crédit', 'Référence']);
    expect(m['date']).toBe('Date');
    expect(m['label']).toBe('Libellé');
    expect(m['debit']).toBe('Débit');
    expect(m['credit']).toBe('Crédit');
    expect(m['reference']).toBe('Référence');
  });
  it('mappe les en-têtes EN', () => {
    const m = detectColumnMapping(['Transaction Date', 'Description', 'Withdrawals', 'Deposits', 'Balance']);
    expect(m['date']).toBe('Transaction Date');
    expect(m['label']).toBe('Description');
    expect(m['debit']).toBe('Withdrawals');
    expect(m['credit']).toBe('Deposits');
    expect(m['balanceAfter']).toBe('Balance');
  });
});

describe('bank.parsers — parseDate', () => {
  // Assertions en UTC : une date de relevé est une date calendaire, elle ne doit
  // dépendre ni du fuseau de la machine ni de l’heure d’été.
  const iso = (d: Date | null) => d!.toISOString().slice(0, 10);

  it('gère les formats supportés', () => {
    expect(iso(parseDate('2026-03-15', 'YYYY-MM-DD'))).toBe('2026-03-15');
    expect(iso(parseDate('15/03/2026', 'DD/MM/YYYY'))).toBe('2026-03-15');
    expect(iso(parseDate('15/03/26',   'DD/MM/YY'))).toBe('2026-03-15');
    expect(iso(parseDate('03/15/2026', 'MM/DD/YYYY'))).toBe('2026-03-15');
    expect(iso(parseDate('15-03-2026', 'DD-MM-YYYY'))).toBe('2026-03-15');
    expect(iso(parseDate('Mar 15 2026', 'MMM DD YYYY'))).toBe('2026-03-15');
  });

  // Régression : `new Date(y, m, d)` = minuit LOCAL ; à l’est de UTC (Cameroun UTC+1)
  // la date reculait d’un jour à l’écriture en base (colonne @db.Date) et via
  // toISOString(). Une ligne 15/03/2026 était stockée 2026-03-14.
  it('ne décale pas la date d’un jour selon le fuseau (construction UTC)', () => {
    const d = parseDate('01/03/2026', 'DD/MM/YYYY')!;
    expect(d.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it('renvoie null sur chaîne vide', () => {
    expect(parseDate('', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('   ', 'DD/MM/YYYY')).toBeNull();
  });
});

describe('bank.parsers — parseAmount', () => {
  it('format FR "1 234,56" (espace milliers, virgule décimale)', () => {
    expect(parseAmount('1 234,56', ' ', ',')).toBeCloseTo(1234.56);
    expect(parseAmount('1 500 000', ' ', ',')).toBe(1_500_000);
  });
  it('format EU "1.234,56" (point milliers, virgule décimale)', () => {
    expect(parseAmount('1.234,56', '.', ',')).toBeCloseTo(1234.56);
  });
  it('format EN "1,234.56" (virgule milliers, point décimal)', () => {
    expect(parseAmount('1,234.56', ',', '.')).toBeCloseTo(1234.56);
  });
  it('gère les montants négatifs', () => {
    expect(parseAmount('-45000.50', '', '.')).toBeCloseTo(-45000.5);
  });
  it('renvoie null sur valeur vide', () => {
    expect(parseAmount('', ',', '.')).toBeNull();
    expect(parseAmount('   ', ',', '.')).toBeNull();
  });
});

describe('bank.parsers — computeContentHash', () => {
  const date = new Date(2026, 2, 15);
  it('est déterministe', () => {
    const a = computeContentHash('acc1', date, 1000, 'credit', 'VIREMENT');
    const b = computeContentHash('acc1', date, 1000, 'credit', 'VIREMENT');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });
  it('normalise casse et espaces du libellé', () => {
    const a = computeContentHash('acc1', date, 1000, 'credit', 'VIREMENT  CLIENT');
    const b = computeContentHash('acc1', date, 1000, 'credit', 'virement client');
    expect(a).toBe(b);
  });
  it('change si montant / type / compte diffèrent', () => {
    const base = computeContentHash('acc1', date, 1000, 'credit', 'X');
    expect(computeContentHash('acc1', date, 1001, 'credit', 'X')).not.toBe(base);
    expect(computeContentHash('acc1', date, 1000, 'debit', 'X')).not.toBe(base);
    expect(computeContentHash('acc2', date, 1000, 'credit', 'X')).not.toBe(base);
  });
});

describe('bank.parsers — detectFileFormat', () => {
  it('détecte via extension et contenu', () => {
    expect(detectFileFormat('releve.ofx', '')).toBe('ofx');
    expect(detectFileFormat('releve.qfx', '')).toBe('ofx');
    expect(detectFileFormat('releve.sta', 'anything')).toBe('mt940');
    expect(detectFileFormat('x.txt', ':20:REF')).toBe('mt940');
    expect(detectFileFormat('x.txt', '<OFX><STMTTRN></STMTTRN></OFX>')).toBe('ofx');
    expect(detectFileFormat('x.csv', 'Date;Libellé;Débit')).toBe('csv');
  });
});

describe('bank.parsers — parseOfx', () => {
  const ofx = `<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260315
<TRNAMT>1500000.00
<NAME>VIREMENT CLIENT
<FITID>FIT001
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260316
<TRNAMT>-45000.00
<MEMO>ACHAT FOURNITURE
<FITID>FIT002
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it('extrait crédit et débit avec signe correct', () => {
    const txns = parseOfx(ofx, 'acc1');
    expect(txns).toHaveLength(2);
    const [t1, t2] = txns;
    expect(t1!.type).toBe('credit');
    expect(t1!.amount).toBe(1_500_000);
    expect(t1!.label).toBe('VIREMENT CLIENT');
    expect(t1!.reference).toBe('FIT001');
    expect(t2!.type).toBe('debit');
    expect(t2!.amount).toBe(45_000);
    expect(t2!.label).toBe('ACHAT FOURNITURE'); // fallback sur MEMO
  });
});

describe('bank.parsers — parseMt940', () => {
  const mt940 = `:20:STATEMENT001
:25:12345/6789
:28C:00001/001
:60F:C260301XAF1000000,00
:61:2603150315C1500000,00NTRFNONREF
:86:VIREMENT CLIENT SARL
:61:2603160316D45000,00NTRFNONREF
:86:ACHAT FOURNITURE
:62F:C260316XAF2455000,00`;

  it('extrait les lignes :61: avec libellé :86:', () => {
    const txns = parseMt940(mt940, 'acc1');
    expect(txns).toHaveLength(2);
    const [t1, t2] = txns;
    expect(t1!.type).toBe('credit');
    expect(t1!.amount).toBe(1_500_000);
    expect(t1!.label).toBe('VIREMENT CLIENT SARL');
    expect(t1!.transactionDate.toISOString().slice(0, 10)).toBe('2026-03-15');
    expect(t2!.type).toBe('debit');
    expect(t2!.amount).toBe(45_000);
    expect(t2!.label).toBe('ACHAT FOURNITURE');
  });
});

describe('bank.parsers — pipeline CSV débit/crédit (profil FR)', () => {
  const csv = [
    'Date;Libellé;Débit;Crédit',
    '15/03/2026;VIREMENT CLIENT;;1 500 000',
    '16/03/2026;ACHAT FOURNITURE;250 000;',
  ].join('\n');

  it('auto-détecte le format et parse crédit + débit', () => {
    const fmt = autoDetectFormat(csv);
    expect(fmt.delimiter).toBe(';');
    expect(fmt.columnMapping.date).toBe('Date');
    expect(fmt.columnMapping.label).toBe('Libellé');

    const { transactions, errors } = parseAllTransactions(csv, fmt, 'acc1');
    expect(errors).toHaveLength(0);
    expect(transactions).toHaveLength(2);

    const credit = transactions.find(t => t.type === 'credit')!;
    const debit  = transactions.find(t => t.type === 'debit')!;
    expect(credit.amount).toBe(1_500_000);
    expect(credit.label).toBe('VIREMENT CLIENT');
    expect(debit.amount).toBe(250_000);
  });
});

describe('bank.parsers — pipeline CSV montant signé (profil type SG)', () => {
  const csv = [
    'Date opération;Libellé;Montant;Date valeur',
    '15/03/2026;VIREMENT RECU;1500000.00;15/03/2026',
    '16/03/2026;PRELEVEMENT EDF;-45000.50;16/03/2026',
    'Solde au 31/03/2026;;;',
  ].join('\n');

  it('applique amountSign negative-is-debit et ignore les lignes de solde', () => {
    const fmt = autoDetectFormat(csv);
    const { transactions } = parseAllTransactions(csv, fmt, 'acc1');
    expect(transactions).toHaveLength(2); // la ligne "Solde au" est ignorée
    const credit = transactions.find(t => t.type === 'credit')!;
    const debit  = transactions.find(t => t.type === 'debit')!;
    expect(credit.amount).toBe(1_500_000);
    expect(debit.amount).toBeCloseTo(45_000.5);
  });
});

describe('bank.parsers — pipeline CSV EN pipe-délimité (profil type UBA)', () => {
  const csv = [
    'Transaction Date|Description|Withdrawals|Deposits|Balance',
    'Mar 15 2026|SALARY CREDIT|0.00|1,500,000.00|1,500,000.00',
    'Mar 16 2026|ATM WITHDRAWAL|50,000.00|0.00|1,450,000.00',
  ].join('\n');

  it('gère délimiteur |, dates "MMM DD YYYY" et milliers virgule', () => {
    const fmt = autoDetectFormat(csv);
    expect(fmt.delimiter).toBe('|');
    const { transactions } = parseAllTransactions(csv, fmt, 'acc1');
    expect(transactions).toHaveLength(2);
    const credit = transactions.find(t => t.type === 'credit')!;
    const debit  = transactions.find(t => t.type === 'debit')!;
    expect(credit.amount).toBe(1_500_000);
    expect(debit.amount).toBe(50_000);
    expect(credit.transactionDate.toISOString().slice(0, 10)).toBe('2026-03-15');
  });
});

describe('bank.parsers — parseCsvContent (dédup + erreurs)', () => {
  const csv = [
    'Date;Libellé;Débit;Crédit',
    '15/03/2026;VIREMENT CLIENT;;1 500 000',
    'notadate;LIGNE INVALIDE;;500',
    '16/03/2026;;;250 000',
  ].join('\n');

  it('remonte les lignes en erreur (date invalide, libellé vide)', () => {
    const fmt = autoDetectFormat(csv);
    const preview = parseCsvContent(csv, fmt, 'acc1');
    expect(preview.validRows).toBe(1);
    expect(preview.errorRows).toBe(2);
    expect(preview.errors.some(e => /Date invalide/.test(e.message))).toBe(true);
    expect(preview.errors.some(e => /Libellé vide/.test(e.message))).toBe(true);
  });

  it('détecte les doublons via contentHash', () => {
    const fmt = autoDetectFormat(csv);
    const first = parseCsvContent(csv, fmt, 'acc1');
    const knownHash = first.sampleTransactions[0]!.contentHash;

    const second = parseCsvContent(csv, fmt, 'acc1', new Set([knownHash]));
    expect(second.duplicateRows).toBe(1);
    expect(second.validRows).toBe(0);
  });
});

describe('bank.parsers — parseStatementFile (dispatcher)', () => {
  it('route un buffer OFX vers parseOfx', () => {
    const ofx = '<OFX><STMTTRN><DTPOSTED>20260315<TRNAMT>1000.00<NAME>TEST<FITID>1</STMTTRN></OFX>';
    const res = parseStatementFile(Buffer.from(ofx, 'utf-8'), 'x.ofx', 'acc1');
    expect(res.fileFormat).toBe('ofx');
    expect(res.transactions).toHaveLength(1);
    expect(res.totalCredits).toBe(1000);
  });
  it('route un buffer CSV vers l’auto-détection', () => {
    const csv = 'Date;Libellé;Débit;Crédit\n15/03/2026;PAIE;;900000';
    const res = parseStatementFile(Buffer.from(csv, 'utf-8'), 'x.csv', 'acc1');
    expect(res.fileFormat).toBe('csv');
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0]!.type).toBe('credit');
    expect(res.totalCredits).toBe(900000);
  });
});
