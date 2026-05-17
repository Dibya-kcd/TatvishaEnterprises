import { describe, it, expect } from 'vitest';
import { 
  getPackMultiplier, 
  landedCostPerLevel, 
  sellingPrice, 
  getTargetMargin, 
  getAllocationInfo, 
  calculateTierPrice, 
  autoCalcAllTiers, 
  resolvePrice 
} from '../pricing';
import { PricingProduct } from '../pricing';

describe('Pricing Library', () => {
  const mockProduct: PricingProduct = {
    id: 'test-1',
    units_per_packet: 10,
    packets_per_case: 50,
    mrp: 100,
    target_margin_premium: 3,
    target_margin_gold: 5,
    target_margin_silver: 7,
    target_margin_bronze: 10,
    target_margin_basic: 15,
    weight_per_unit_grams: 100,
    pack_size_value: 100,
    pack_size_unit: 'g'
  };

  describe('getPackMultiplier', () => {
    it('returns 1 for pcs type', () => {
      expect(getPackMultiplier(mockProduct, 'pcs')).toBe(1);
    });

    it('returns units_per_packet for packet type', () => {
      expect(getPackMultiplier(mockProduct, 'packet')).toBe(10);
    });

    it('returns total units for case type', () => {
      expect(getPackMultiplier(mockProduct, 'case')).toBe(500);
    });

    it('calculates kg multiplier based on weight_per_unit_grams', () => {
      // 1000g / 100g = 10 units per kg
      expect(getPackMultiplier(mockProduct, 'kg')).toBe(10);
    });

    it('calculates gram multiplier correctly', () => {
      // 1g / 100g = 0.01 units per gram
      expect(getPackMultiplier(mockProduct, 'g')).toBe(0.01);
    });
  });

  describe('landedCostPerLevel', () => {
    it('derives costs correctly when base is per case', () => {
      const costs = landedCostPerLevel(mockProduct, 5000, false); // 5000 per case
      expect(costs.case).toBe(5000);
      expect(costs.pcs).toBe(10); // 5000 / 500
      expect(costs.packet).toBe(100); // 10 * 10
    });

    it('derives costs correctly when base is per unit', () => {
      const costs = landedCostPerLevel(mockProduct, 10, true); // 10 per unit
      expect(costs.pcs).toBe(10);
      expect(costs.case).toBe(5000); // 10 * 500
      expect(costs.packet).toBe(100); // 10 * 10
    });

    it('derives costs correctly when base is per kg', () => {
      const costs = landedCostPerLevel(mockProduct, 100, 'kg'); // 100 per kg
      // Product is 100g per unit. So 100 per kg -> 10 per unit.
      expect(costs.pcs).toBe(10);
      expect(costs.kg).toBe(100);
      expect(costs.case).toBe(5000);
    });

    it('derives costs correctly for ml and ltr', () => {
      const liquidProduct: PricingProduct = {
        ...mockProduct,
        pack_size_value: 500,
        pack_size_unit: 'ml'
      };
      const costs = landedCostPerLevel(liquidProduct, 50, 'pcs'); // 50 per 500ml unit
      expect(costs.pcs).toBe(50);
      expect(costs.ml).toBe(0.1); // 50 / 500
      expect(costs.ltr).toBe(100); // 0.1 * 1000
    });
  });

  describe('sellingPrice', () => {
    it('calculates selling price with margin', () => {
      // landed / (1 - 0.2) = 100 / 0.8 = 125
      expect(sellingPrice(100, 20, 1)).toBe(125);
    });

    it('rounds to the specified increment', () => {
      // landed: 10, margin: 10% -> 10 / 0.9 = 11.11
      // Round to 0.5 -> 11.5
      expect(sellingPrice(10, 10, 0.5)).toBe(11.5);
    });

    it('returns landed cost if margin is invalid', () => {
      expect(sellingPrice(100, 100)).toBe(100);
      expect(sellingPrice(100, 110)).toBe(100);
    });
  });

  describe('getTargetMargin', () => {
    it('returns product specific margin if available', () => {
      expect(getTargetMargin(mockProduct, 'premium')).toBe(3);
    });

    it('returns default margin if product value is 0 or missing', () => {
      const poorProduct: PricingProduct = { id: '2', units_per_packet: 1, packets_per_case: 1 };
      expect(getTargetMargin(poorProduct, 'basic')).toBe(15);
    });
  });

  describe('getAllocationInfo', () => {
    it('allocates by weight if available', () => {
      const result = getAllocationInfo({
        itemQty: 10,
        itemUnitCost: 100,
        itemBaseUnits: 10,
        itemWeightGrams: 500, // 5kg total for item
        totalFreight: 1000,
        totalWeightKG: 50,
        totalInvoiceValue: 10000
      });
      expect(result.method).toBe('⚖ Weight');
      expect(result.freightAmount).toBe(100); // (5 / 50) * 1000
    });

    it('allocates by value if weight is not available', () => {
      const result = getAllocationInfo({
        itemQty: 10,
        itemUnitCost: 100,
        itemBaseUnits: 10,
        itemWeightGrams: 0,
        totalFreight: 1000,
        totalWeightKG: 0,
        totalInvoiceValue: 10000
      });
      expect(result.method).toBe('₹ Invoice');
      expect(result.freightAmount).toBe(100); // (1000 / 10000) * 1000
    });
  });

  describe('calculateTierPrice', () => {
    it('calculates expected price for a specific tier and pack', () => {
      // Landed pcs: 10. Margin Bronze: 10% -> 10 / 0.9 = 11.11. Round 0.5 -> 11.5
      const price = calculateTierPrice(mockProduct, 'bronze', 'pcs', 5000); // 5000 per case = 10 per unit
      expect(price).toBe(11.5);
    });
  });

  describe('autoCalcAllTiers', () => {
    it('generates a full matrix of prices', () => {
      const results = autoCalcAllTiers(mockProduct, 5000);
      // 5 shop types * 5 valid pack types (pcs, packet, case, kg, g) = 25 entries
      // ml and ltr are 0 because mockProduct is grams based
      expect(results.length).toBe(25);
      expect(results[0]).toHaveProperty('shop_type');
      expect(results[0]).toHaveProperty('price');
    });
  });

  describe('resolvePrice', () => {
    it('prioritizes shop overrides', () => {
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        shopOverride: 99
      });
      expect(result.price).toBe(99);
      expect(result.source).toBe('override');
    });

    it('uses saved tiers if no override', () => {
      const savedTiers = new Map();
      savedTiers.set('premium:pcs', 88);
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        savedTiers
      });
      expect(result.price).toBe(88);
      expect(result.source).toBe('tier');
    });

    it('falls back to RBP if provided', () => {
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        rbpFallback: 77
      });
      expect(result.price).toBe(77);
      expect(result.source).toBe('rbp');
    });

    it('auto-calculates from landed cost if available', () => {
      // Landed 10, Premium margin 3% -> 10 / 0.97 = 10.30 -> rounded 10.5
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        landedCost: 10
      });
      expect(result.price).toBe(10.5);
      expect(result.source).toBe('auto');
    });

    it('falls back to MRP-based discount if all else fails', () => {
      // MRP 100, Premium discount 60% -> 60
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium'
      });
      expect(result.price).toBe(60);
      expect(result.source).toBe('auto');
    });
  });
});
