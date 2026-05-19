/**
 * @module lib/csv
 * Helper de génération de fichiers CSV avec BOM UTF-8 (compatibilité Excel).
 */

/** Convertit un tableau d'objets en CSV avec BOM UTF-8 */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): Buffer {
  const BOM = '\uFEFF';
  const escape = (v: string | number | boolean | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];

  return Buffer.from(BOM + lines.join('\r\n'), 'utf-8');
}

/** Envoie un fichier CSV en réponse HTTP */
export function sendCsvResponse(
  res: import('express').Response,
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): void {
  const buffer = toCsv(headers, rows);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}
