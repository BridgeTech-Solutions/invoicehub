export interface BankProfile {
  id: string;
  name: string;
  country: string;

  source: 'estimated' | 'community' | 'verified';
  verificationNote?: string;

  fileFormat: 'csv' | 'ofx' | 'mt940';
  encoding: 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le';
  delimiter: ',' | ';' | '\t' | '|';
  dateFormat: string;
  numberFormat: {
    thousands: string;
    decimal: string;
  };
  columns: {
    date: string | string[];
    label: string | string[];
    debit?: string | string[];
    credit?: string | string[];
    amount?: string | string[];
    direction?: string | string[];
    reference?: string | string[];
    balanceAfter?: string | string[];
    valueDate?: string | string[];
  };
  directionValues?: {
    debit: string[];
    credit: string[];
  };
  amountSign?: 'negative-is-debit' | 'positive-is-credit';
  skipRowsContaining?: string[];
  skipFirstRows?: number;
  headerRow?: number;
}

export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'afriland-first-bank-cmr',
    name: 'Afriland First Bank (Cameroun)',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — banque francophone CEMAC. Format non confirmé publiquement. À valider lors du premier import réel.',
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['Date', 'DATE', 'Date Opération', 'Date Operation', 'Date Ope'],
      label:        ['Libellé', 'Libelle', 'LIBELLE', 'Motif', 'MOTIF'],
      debit:        ['Débit', 'Debit', 'DEBIT', 'Sortie', 'SORTIE'],
      credit:       ['Crédit', 'Credit', 'CREDIT', 'Entrée', 'Entree', 'ENTREE'],
      reference:    ['Référence', 'Reference', 'Réf', 'Ref', 'REF'],
      balanceAfter: ['Solde', 'SOLDE', 'Solde Progressif', 'SOLDE PROGRESSIF'],
    },
    skipRowsContaining: ['SOLDE ANCIEN', 'TOTAL MOUVEMENTS', 'REPORT', 'A NOUVEAU', 'ANCIEN SOLDE'],
  },
  {
    id: 'scb-cameroun',
    name: 'SCB Cameroun — Attijariwafa Bank',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe Attijariwafa (Maroc). Format inspiré des exports Attijariwafa France. À valider.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: { thousands: '', decimal: '.' },
    columns: {
      date:         ['DATE OPERATION', 'DATE_OPERATION', 'date_operation', 'DATE', 'Date'],
      label:        ['LIBELLE', 'libelle', 'DESCRIPTION', 'Description'],
      amount:       ['MONTANT', 'montant', 'AMOUNT'],
      direction:    ['SENS', 'sens', 'TYPE', 'DR_CR', 'Nature'],
      balanceAfter: ['SOLDE PROGRESSIF', 'SOLDE', 'BALANCE', 'Solde'],
    },
    directionValues: {
      debit:  ['D', 'DB', 'DEBIT', 'DR', 'Débit'],
      credit: ['C', 'CR', 'CREDIT', 'Crédit'],
    },
  },
  {
    id: 'uba-cameroun',
    name: 'UBA Cameroun (United Bank for Africa)',
    country: 'CM',
    source: 'community',
    verificationNote: 'Export CSV confirmé pour UBA Ghana (guide officiel UBA 2021). UBA Cameroun suit probablement le même format groupe. À valider.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: '|',
    dateFormat: 'MMM DD YYYY',
    numberFormat: { thousands: ',', decimal: '.' },
    columns: {
      date:         ['Transaction Date', 'Date', 'VALUE DATE', 'Trans Date'],
      label:        ['Description', 'Narration', 'DESCRIPTION', 'Details'],
      debit:        ['Withdrawals', 'Debit', 'DR', 'DEBIT'],
      credit:       ['Deposits', 'Credit', 'CR', 'CREDIT'],
      balanceAfter: ['Balance', 'BALANCE', 'Running Balance', 'Ledger Balance'],
    },
    skipRowsContaining: ['Opening Balance', 'Closing Balance', 'Total', 'TOTAL'],
  },
  {
    id: 'ecobank-cameroun',
    name: 'Ecobank Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: "Profil estimé — groupe Ecobank panafricain. Format inspiré du portail Ecobank Côte d'Ivoire. À valider pour le Cameroun.",
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YY',
    numberFormat: { thousands: '', decimal: ',' },
    columns: {
      date:         ['Dt Opé', 'Dt Ope', 'Date Opé', 'Date Ope', 'Date'],
      label:        ['Libellé', 'Libelle', 'Description', 'LIBELLE'],
      debit:        ['Débit', 'Debit', 'DEBIT'],
      credit:       ['Crédit', 'Credit', 'CREDIT'],
      reference:    ['Réf', 'Ref', 'Référence', 'Reference'],
      valueDate:    ['Dt Val', 'Date Val', 'Date Valeur', 'Valeur'],
    },
  },
  {
    id: 'sgc-cameroun',
    name: 'Société Générale Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe Société Générale France. Format identique au portail SG France (montant signé). À confirmer.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: '', decimal: '.' },
    columns: {
      date:         ['Date opération', 'Date operation', 'Date', 'DATE'],
      label:        ['Libellé', 'Libelle', 'LIBELLE'],
      amount:       ['Montant', 'Amount', 'MONTANT'],
      valueDate:    ['Date valeur', 'Date Valeur', 'Valeur'],
    },
    amountSign: 'negative-is-debit',
    skipRowsContaining: ['Solde au', 'TOTAL', 'Ancien solde'],
  },
  {
    id: 'bicec-cameroun',
    name: 'BICEC — Banque Internationale du Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe BNP Paribas (BICEC = BNP Cameroun). Format inspiré du standard BNP francophone. À valider.',
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['Date', 'DATE OPE', 'DATE OPERATION', 'Date Opé'],
      label:        ['Libellé', 'LIBELLE', 'MOTIF', 'Motif'],
      debit:        ['Débit', 'DEBIT', 'MONTANT DEBIT', 'Débit (XAF)'],
      credit:       ['Crédit', 'CREDIT', 'MONTANT CREDIT', 'Crédit (XAF)'],
      balanceAfter: ['Solde', 'SOLDE', 'Solde (XAF)'],
    },
    skipRowsContaining: ['SOLDE INITIAL', 'TOTAL', 'Solde au'],
  },
  {
    id: 'generic-fr',
    name: 'Format générique francophone (fallback)',
    country: '*',
    source: 'estimated',
    verificationNote: 'Profil générique basé sur le standard CSV francophone. Utilisé quand aucun profil spécifique ne correspond.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['date', 'Date', 'DATE'],
      label:        ['libelle', 'Libellé', 'libellé', 'label', 'description'],
      debit:        ['debit', 'Débit', 'débit', 'sortie'],
      credit:       ['credit', 'Crédit', 'crédit', 'entrée', 'entree'],
    },
  },
  {
    id: 'generic-en',
    name: 'Format générique anglophone (fallback)',
    country: '*',
    source: 'estimated',
    verificationNote: 'Profil générique basé sur le standard CSV anglophone. Utilisé pour les banques anglophones (UBA, Stanbic, Banque Atlantique anglophone).',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ',', decimal: '.' },
    columns: {
      date:         ['Date', 'Transaction Date', 'Trans Date', 'VALUE DATE'],
      label:        ['Description', 'Narration', 'Details', 'Particulars'],
      debit:        ['Debit', 'Withdrawals', 'DR', 'Debit Amount'],
      credit:       ['Credit', 'Deposits', 'CR', 'Credit Amount'],
      balanceAfter: ['Balance', 'Running Balance', 'Ledger Balance'],
    },
  },
];

export function findProfileById(id: string): BankProfile | undefined {
  return BANK_PROFILES.find(p => p.id === id);
}

export function getVerifiedProfiles(): BankProfile[] {
  return BANK_PROFILES.filter(p => p.source === 'verified');
}

export function getProfilesByCountry(country: string): BankProfile[] {
  return BANK_PROFILES.filter(p => p.country === country || p.country === '*');
}
