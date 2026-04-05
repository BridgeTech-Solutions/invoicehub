/**
 * Tests unitaires — lib/csv
 *
 * toCsv() + sendCsvResponse()
 */
import { Response } from 'express';
import { toCsv, sendCsvResponse } from '../../lib/csv';

describe('toCsv', () => {

  describe('structure de base', () => {
    it('retourne un Buffer', () => {
      const buf = toCsv(['Col1', 'Col2'], [['A', 'B']]);
      expect(buf).toBeInstanceOf(Buffer);
    });

    it('commence par le BOM UTF-8 (EF BB BF)', () => {
      const buf = toCsv(['Col'], [['val']]);
      expect(buf[0]).toBe(0xEF);
      expect(buf[1]).toBe(0xBB);
      expect(buf[2]).toBe(0xBF);
    });

    it('génère la ligne d\'en-tête en première ligne', () => {
      const buf = toCsv(['Nom', 'Montant', 'Date'], []);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      const lines = content.split('\r\n');
      expect(lines[0]).toBe('Nom,Montant,Date');
    });

    it('génère les lignes de données après l\'en-tête', () => {
      const buf = toCsv(
        ['Nom', 'Montant'],
        [['Camtel', '500000'], ['Orange CM', '250000']],
      );
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      const lines = content.split('\r\n');
      expect(lines[0]).toBe('Nom,Montant');
      expect(lines[1]).toBe('Camtel,500000');
      expect(lines[2]).toBe('Orange CM,250000');
    });

    it('utilise CRLF comme séparateur de lignes (compatibilité Excel)', () => {
      const buf = toCsv(['A'], [['1'], ['2']]);
      const content = buf.toString('utf-8');
      expect(content).toContain('\r\n');
    });
  });

  describe('échappement des valeurs', () => {
    it('échappe les virgules dans les valeurs (guillemets)', () => {
      const buf = toCsv(['Desc'], [['Service A, option B']]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content).toContain('"Service A, option B"');
    });

    it('échappe les guillemets doubles dans les valeurs', () => {
      const buf = toCsv(['Note'], [['"Important"']]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content).toContain('"""Important"""');
    });

    it('échappe les sauts de ligne dans les valeurs', () => {
      const buf = toCsv(['Note'], [['Ligne 1\nLigne 2']]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content).toContain('"Ligne 1\nLigne 2"');
    });

    it('convertit les nombres en chaînes', () => {
      const buf = toCsv(['Montant'], [[500_000]]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content).toContain('500000');
    });

    it('convertit les booléens en chaînes', () => {
      const buf = toCsv(['Actif'], [[true], [false]]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content).toContain('true');
      expect(content).toContain('false');
    });

    it('retourne une chaîne vide pour null et undefined', () => {
      const buf = toCsv(['A', 'B'], [[null, undefined]]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      const dataLine = content.split('\r\n')[1];
      expect(dataLine).toBe(',');
    });
  });

  describe('cas limites', () => {
    it('fonctionne sans lignes de données (header only)', () => {
      const buf = toCsv(['Col1', 'Col2'], []);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      expect(content.trim()).toBe('Col1,Col2');
    });

    it('fonctionne avec une seule colonne', () => {
      const buf = toCsv(['Total'], [['100000'], ['200000']]);
      const content = buf.toString('utf-8').replace('\uFEFF', '');
      const lines = content.split('\r\n');
      expect(lines[0]).toBe('Total');
      expect(lines[1]).toBe('100000');
    });

    it('préserve les caractères accentués (encodage UTF-8)', () => {
      const buf = toCsv(['Désignation'], [['Prestation réalisée à Douala']]);
      const content = buf.toString('utf-8');
      expect(content).toContain('Prestation réalisée à Douala');
    });
  });
});

// ── sendCsvResponse ───────────────────────────────────────────────────────────

describe('sendCsvResponse', () => {
  function makeMockRes() {
    const send = jest.fn();
    const set  = jest.fn().mockReturnThis();
    return { send, set } as unknown as Response & { send: jest.Mock; set: jest.Mock };
  }

  it('appelle res.set avec Content-Type text/csv et Content-Disposition', () => {
    const res = makeMockRes();
    sendCsvResponse(res, 'export.csv', ['Nom'], [['Camtel']]);
    expect((res as unknown as { set: jest.Mock }).set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="export.csv"',
      }),
    );
  });

  it('appelle res.send avec le buffer CSV', () => {
    const res = makeMockRes();
    sendCsvResponse(res, 'factures.csv', ['Ref', 'Montant'], [['FAC001', '500000']]);
    const buf = (res as unknown as { send: jest.Mock }).send.mock.calls[0][0] as Buffer;
    expect(buf).toBeInstanceOf(Buffer);
    const content = buf.toString('utf-8').replace('\uFEFF', '');
    expect(content).toContain('FAC001');
    expect(content).toContain('500000');
  });

  it('renseigne Content-Length avec la taille exacte du buffer', () => {
    const res = makeMockRes();
    sendCsvResponse(res, 'test.csv', ['A'], [['val']]);
    const setCall = (res as unknown as { set: jest.Mock }).set.mock.calls[0][0] as Record<string, unknown>;
    const buf = toCsv(['A'], [['val']]);
    expect(setCall['Content-Length']).toBe(buf.length);
  });
});
