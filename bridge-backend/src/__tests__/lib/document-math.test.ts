/**
 * Tests unitaires — lib/document-math
 *
 * Fonctions critiques : computeLine() et computeTotals()
 * TVA SYSCOHADA standard : 19,25 %
 *
 * Ces tests ne dépendent d'aucune DB ni service externe.
 * Ils doivent passer à 100% avant tout déploiement.
 */
import { computeLine, computeTotals } from '../../lib/document-math';

// ── computeLine ──────────────────────────────────────────────────────────────

describe('computeLine', () => {

  describe('sans remise', () => {
    it('calcule correctement 2 × 100 000 HT à 19,25 %', () => {
      const r = computeLine({ quantity: 2, unitPriceHt: 100_000, discountType: 'none', discountValue: 0, taxRate: 19.25 });
      expect(r.subtotalHt).toBe(200_000);
      expect(r.discountAmount).toBe(0);
      expect(r.netHt).toBe(200_000);
      expect(r.taxAmount).toBe(38_500);
      expect(r.totalTtc).toBe(238_500);
    });

    it('calcule correctement 1 × 50 000 HT à 19,25 %', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 50_000, discountType: 'none', discountValue: 0, taxRate: 19.25 });
      expect(r.subtotalHt).toBe(50_000);
      expect(r.netHt).toBe(50_000);
      expect(r.taxAmount).toBe(9_625);
      expect(r.totalTtc).toBe(59_625);
    });

    it('retourne tous les champs à 0 pour un prix unitaire à 0', () => {
      const r = computeLine({ quantity: 5, unitPriceHt: 0, discountType: 'none', discountValue: 0, taxRate: 19.25 });
      expect(r.subtotalHt).toBe(0);
      expect(r.discountAmount).toBe(0);
      expect(r.netHt).toBe(0);
      expect(r.taxAmount).toBe(0);
      expect(r.totalTtc).toBe(0);
    });

    it('calcule correctement avec TVA 0% (exonéré)', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'none', discountValue: 0, taxRate: 0 });
      expect(r.taxAmount).toBe(0);
      expect(r.totalTtc).toBe(100_000);
    });

    it('arrondit correctement à 2 décimales', () => {
      // 3 × 33 333,33 HT
      const r = computeLine({ quantity: 3, unitPriceHt: 33_333.33, discountType: 'none', discountValue: 0, taxRate: 19.25 });
      expect(r.subtotalHt).toBe(99_999.99);
      expect(Number.isFinite(r.taxAmount)).toBe(true);
      // Vérifie précision à 2 décimales
      expect(r.taxAmount).toBe(Math.round(r.netHt * 19.25) / 100);
    });
  });

  describe('remise en pourcentage', () => {
    it('applique 10% de remise sur 100 000 HT', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'percentage', discountValue: 10, taxRate: 19.25 });
      expect(r.discountAmount).toBe(10_000);
      expect(r.netHt).toBe(90_000);
      expect(r.taxAmount).toBe(17_325);
      expect(r.totalTtc).toBe(107_325);
    });

    it('applique 100% de remise → résultat à 0', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'percentage', discountValue: 100, taxRate: 19.25 });
      expect(r.discountAmount).toBe(100_000);
      expect(r.netHt).toBe(0);
      expect(r.taxAmount).toBe(0);
      expect(r.totalTtc).toBe(0);
    });

    it('applique 0% de remise → identique à sans remise', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'percentage', discountValue: 0, taxRate: 19.25 });
      expect(r.discountAmount).toBe(0);
      expect(r.netHt).toBe(100_000);
    });

    it('calcule remise % sur plusieurs quantités', () => {
      // 2 × 100 000 = 200 000 HT, remise 5% = 10 000, net = 190 000
      const r = computeLine({ quantity: 2, unitPriceHt: 100_000, discountType: 'percentage', discountValue: 5, taxRate: 19.25 });
      expect(r.subtotalHt).toBe(200_000);
      expect(r.discountAmount).toBe(10_000);
      expect(r.netHt).toBe(190_000);
      expect(r.taxAmount).toBe(36_575);
      expect(r.totalTtc).toBe(226_575);
    });
  });

  describe('remise en montant fixe', () => {
    it('déduit 5 000 de remise fixe sur 100 000 HT', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'fixed', discountValue: 5_000, taxRate: 19.25 });
      expect(r.discountAmount).toBe(5_000);
      expect(r.netHt).toBe(95_000);
      expect(r.taxAmount).toBe(18_287.5);
      expect(r.totalTtc).toBe(113_287.5);
    });

    it('plafonne la remise fixe au montant HT (pas de négatif)', () => {
      // Remise 200 000 sur 100 000 HT → plafonné à 100 000
      const r = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'fixed', discountValue: 200_000, taxRate: 19.25 });
      expect(r.discountAmount).toBe(100_000);
      expect(r.netHt).toBe(0);
      expect(r.totalTtc).toBe(0);
    });

    it('accepte une remise fixe égale au montant HT', () => {
      const r = computeLine({ quantity: 1, unitPriceHt: 50_000, discountType: 'fixed', discountValue: 50_000, taxRate: 19.25 });
      expect(r.discountAmount).toBe(50_000);
      expect(r.netHt).toBe(0);
    });
  });

  describe('cohérence des totaux', () => {
    it('vérifie que netHt + taxAmount = totalTtc', () => {
      const cases = [
        { quantity: 3, unitPriceHt: 75_000, discountType: 'percentage' as const, discountValue: 7, taxRate: 19.25 },
        { quantity: 1, unitPriceHt: 12_500, discountType: 'fixed' as const,      discountValue: 500, taxRate: 19.25 },
        { quantity: 10, unitPriceHt: 1_000, discountType: 'none' as const,        discountValue: 0, taxRate: 0 },
      ];
      for (const c of cases) {
        const r = computeLine(c);
        expect(r.netHt + r.taxAmount).toBeCloseTo(r.totalTtc, 2);
      }
    });
  });
});

// ── computeTotals ────────────────────────────────────────────────────────────

describe('computeTotals', () => {

  const line1 = computeLine({ quantity: 1, unitPriceHt: 100_000, discountType: 'none', discountValue: 0, taxRate: 19.25 });
  const line2 = computeLine({ quantity: 2, unitPriceHt: 50_000,  discountType: 'none', discountValue: 0, taxRate: 19.25 });

  describe('sans remise globale', () => {
    it('additionne deux lignes sans remise globale', () => {
      // line1 : netHt=100 000 taxAmount=19 250
      // line2 : netHt=100 000 taxAmount=19 250
      const t = computeTotals([line1, line2], 'none', 0);
      expect(t.subtotalHt).toBe(200_000);
      expect(t.globalDiscountAmount).toBe(0);
      expect(t.totalHt).toBe(200_000);
      expect(t.totalTax).toBe(38_500);
      expect(t.totalTtc).toBe(238_500);
    });

    it('fonctionne avec une seule ligne', () => {
      const t = computeTotals([line1], 'none', 0);
      expect(t.subtotalHt).toBe(100_000);
      expect(t.totalTtc).toBe(119_250);
    });
  });

  describe('remise globale en pourcentage', () => {
    it('applique 10% de remise globale sur 200 000 HT', () => {
      const t = computeTotals([line1, line2], 'percentage', 10);
      expect(t.subtotalHt).toBe(200_000);
      expect(t.globalDiscountAmount).toBe(20_000);
      expect(t.totalHt).toBe(180_000);
      // TVA calculée sur les netHt des lignes (avant remise globale)
      expect(t.totalTax).toBe(38_500);
      expect(t.totalTtc).toBe(218_500);
    });

    it('applique 0% → identique à sans remise', () => {
      const t = computeTotals([line1], 'percentage', 0);
      expect(t.globalDiscountAmount).toBe(0);
      expect(t.totalHt).toBe(t.subtotalHt);
    });
  });

  describe('remise globale en montant fixe', () => {
    it('déduit 10 000 de remise globale fixe', () => {
      const t = computeTotals([line1, line2], 'fixed', 10_000);
      expect(t.globalDiscountAmount).toBe(10_000);
      expect(t.totalHt).toBe(190_000);
      expect(t.totalTax).toBe(38_500);
      expect(t.totalTtc).toBe(228_500);
    });

    it('plafonne la remise fixe au subtotalHt', () => {
      const t = computeTotals([line1], 'fixed', 999_999);
      expect(t.globalDiscountAmount).toBe(100_000); // Plafonné
      expect(t.totalHt).toBe(0);
    });
  });

  describe('cohérence', () => {
    it('totalHt + totalTax = totalTtc pour plusieurs lignes avec remise', () => {
      const lines = [
        computeLine({ quantity: 3, unitPriceHt: 75_000, discountType: 'percentage', discountValue: 5, taxRate: 19.25 }),
        computeLine({ quantity: 1, unitPriceHt: 25_000, discountType: 'fixed', discountValue: 2_000, taxRate: 19.25 }),
      ];
      const t = computeTotals(lines, 'percentage', 8);
      expect(t.totalHt + t.totalTax).toBeCloseTo(t.totalTtc, 2);
    });

    it('liste vide → tous les totaux à 0', () => {
      const t = computeTotals([], 'none', 0);
      expect(t.subtotalHt).toBe(0);
      expect(t.totalHt).toBe(0);
      expect(t.totalTax).toBe(0);
      expect(t.totalTtc).toBe(0);
    });
  });
});
