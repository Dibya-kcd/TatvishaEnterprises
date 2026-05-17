import { describe, it, expect } from 'vitest';
import { derivePackaging, convertToBaseUnits, getDetailedStockBreakdown } from '../packaging';
import { Product } from '@/types';

describe('Packaging Library', () => {
  const mockProduct: Partial<Product> = {
    id: 'p1',
    name: 'Tej Patta',
    unit_type: 'pcs',
    units_per_packet: 1,
    packets_per_case: 50,
    units_per_case: 50,
    pack_size_value: 10,
    pack_size_unit: 'g'
  };

  describe('derivePackaging', () => {
    it('derives correctly for pcs type', () => {
      const info = derivePackaging(mockProduct);
      expect(info.baseUnit).toBe('pcs');
      expect(info.topUnit).toBe('Case');
      expect(info.totalItemsInTop).toBe(50);
    });

    it('derives correctly for packet type', () => {
      const packetProd = { ...mockProduct, unit_type: 'packet' as const, units_per_packet: 10, units_per_case: 500 };
      const info = derivePackaging(packetProd);
      expect(info.midUnit).toBe('Packet');
      expect(info.midMultiplier).toBe(10);
      expect(info.totalItemsInTop).toBe(500); // 10 * 50
    });

    it('derives correctly for weight-based products (kg_g)', () => {
      const kgProd = { 
        ...mockProduct, 
        unit_type: 'kg_g' as const, 
        pack_size_value: 500, 
        pack_size_unit: 'g' 
      };
      const info = derivePackaging(kgProd);
      expect(info.baseUnit).toBe('g');
      expect(info.allowKg).toBe(true);
    });
  });

  describe('convertToBaseUnits', () => {
    it('identifies case conversion correctly', () => {
      const base = convertToBaseUnits(2, 'case', mockProduct);
      expect(base).toBe(100); // 2 cases * 50 units
    });

    it('identifies packet conversion correctly', () => {
      const packetProd = { ...mockProduct, units_per_packet: 10 };
      const base = convertToBaseUnits(3, 'packet', packetProd);
      expect(base).toBe(30); // 3 packets * 10 units
    });

    it('handles kg to grams conversion for loose items', () => {
      const kgProd = { unit_type: 'kg_g' as const };
      const base = convertToBaseUnits(2.5, 'kg', kgProd);
      expect(base).toBe(2500);
    });

    it('handles kg based on pack size for discrete items', () => {
      const kgProd = { 
        unit_type: 'kg_g' as const, 
        pack_size_value: 250, 
        pack_size_unit: 'g' 
      };
      // 1kg = (1000/250) = 4 units
      // 2kg = 8 units
      const base = convertToBaseUnits(2, 'kg', kgProd);
      expect(base).toBe(8);
    });
  });

  describe('getDetailedStockBreakdown', () => {
    it('breaks down stock into cases and units', () => {
      const breakdown = getDetailedStockBreakdown(125, mockProduct);
      expect(breakdown.cases).toBe(2); // 100 units
      expect(breakdown.units).toBe(25); // remainder
    });

    it('includes packets if available', () => {
      const packetProd = { ...mockProduct, units_per_packet: 10, packets_per_case: 5 }; // 50 units per case
      const breakdown = getDetailedStockBreakdown(73, packetProd);
      // 73 units:
      // 1 case (50 units)
      // 23 units remain
      // 2 packets (20 units)
      // 3 units remain
      expect(breakdown.cases).toBe(1);
      expect(breakdown.packets).toBe(2);
      expect(breakdown.units).toBe(3);
    });
  });
});
