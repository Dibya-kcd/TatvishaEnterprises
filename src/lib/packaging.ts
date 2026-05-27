import { Product } from "@/types";

export interface PackagingInfo {
  baseUnit: string;
  midUnit: string | null;
  topUnit: string;
  midMultiplier: number; // units per mid
  topMultiplier: number; // mid per top (if mid exists) OR units per top
  totalItemsInTop: number;
  retailMin: string;
  whsleMin: string;
  distrMin: string;
  allowKg: boolean;
}

/**
 * Inffers unit type for backward compatibility with old products.
 */
function inferUnitType(p: Partial<Product>): 'pcs' | 'packet' | 'kg_g' {
  const psu = (p.pack_size_unit || '').toLowerCase();
  const cqu = (p.case_qty_unit || '').toLowerCase();
  const fmt = (p.item_pack_type || '').toLowerCase();
  
  if (['g','gms','kg', 'kilogram', 'kilograms', 'ml','ltr','l'].includes(psu) || cqu === 'kg' || fmt === 'kg') {
    return 'kg_g';
  }
  if ((p.units_per_packet || 0) > 1) return 'packet';
  return 'pcs';
}

function deriveKgPackaging(p: Partial<Product>): PackagingInfo {
  const dw = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
  const isLiquid = ['ml','ltr','l'].includes(dw);
  const baseUnit = isLiquid ? 'ml' : 'g';
  const topUnit = p.item_pack_type === 'bag' ? 'Bag' : (p.item_pack_type === 'box' || p.item_pack_type === 'carton' ? 'Carton' : 'Case');
  
  const midMultiplier = p.units_per_packet || 1;
  const topMultiplier = p.packets_per_case || 1;
  let totalItemsInTop = p.units_per_case || (midMultiplier * topMultiplier);

  // If we have case_qty_value/unit and it matches weight units, use that for total pcs in case
  if (totalItemsInTop <= 1 && (p.case_qty_value || 0) > 0 && (p.pack_size_value || 0) > 0) {
    const psu = (p.pack_size_unit || 'g').toLowerCase();
    const cqu = (p.case_qty_unit || 'unit').toLowerCase();
    
    if (cqu === 'kg' && ['g', 'gms', 'gm', 'grams'].includes(psu)) {
      totalItemsInTop = ((p.case_qty_value || 0) * 1000) / (p.pack_size_value || 1);
    } else if (cqu === psu) {
      totalItemsInTop = (p.case_qty_value || 0) / (p.pack_size_value || 1);
    }
  }

  return {
    baseUnit,
    midUnit: midMultiplier > 1 ? 'Packet' : null,
    topUnit,
    midMultiplier,
    topMultiplier: midMultiplier > 1 ? topMultiplier : totalItemsInTop,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: `1 ${dw}`,
    whsleMin: `1 ${topUnit}`,
    distrMin: `1 ${topUnit}`,
    allowKg: true
  };
}

function derivePacketPackaging(p: Partial<Product>): PackagingInfo {
  const midMultiplier = p.units_per_packet || 1;
  const topMultiplier = p.packets_per_case || 1;
  const totalItemsInTop = p.units_per_case || (midMultiplier * topMultiplier);

  return {
    baseUnit: 'pcs',
    midUnit: 'Packet',
    topUnit: 'Case',
    midMultiplier,
    topMultiplier,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: `1 Packet`,
    whsleMin: `1 Case`,
    distrMin: `1 Case`,
    allowKg: false
  };
}

function derivePcsPackaging(p: Partial<Product>): PackagingInfo {
  const totalItemsInTop = p.units_per_case || 1;
  return {
    baseUnit: 'pcs',
    midUnit: null,
    topUnit: 'Case',
    midMultiplier: 1,
    topMultiplier: totalItemsInTop,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: p.is_chain_item ? `1 unit` : `1 pcs`,
    whsleMin: `1 Case`,
    distrMin: `1 Case`,
    allowKg: false
  };
}

export function derivePackaging(p: Partial<Product> | null | undefined): PackagingInfo {
  const safeP = p || {};
  const unitType = safeP.unit_type || inferUnitType(safeP);

  if (unitType === 'kg_g') {
    return deriveKgPackaging(safeP);
  } else if (unitType === 'packet') {
    return derivePacketPackaging(safeP);
  } else {
    return derivePcsPackaging(safeP);
  }
}

/**
 * Returns the sell units a product can be sold in, in order of preference.
 */
export function getAvailableSellUnits(p: Partial<Product>): string[] {
  const unitType = p.unit_type || inferUnitType(p);
  const upc = p.units_per_case || ((p.units_per_packet || 1) * (p.packets_per_case || 1));
  const hasPacket = (p.units_per_packet || 0) > 1;
  const hasCase = upc > 1;

  if (unitType === 'pcs' || unitType === 'packet') {
    const units = ['pcs'];
    if (hasPacket) units.push('packet');
    if (hasCase)   units.push('case');
    return units;
  }
  
  if (unitType === 'kg_g') {
    const dw = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
    const isLiquid = ['ml','ltr','l'].includes(dw);
    
    // We treat it as a discrete weighted item (pouch/jar) if it has a specific pack size.
    // Loose/Bulk items (no pack size) will get granular g/ml options.
    const wpug = p.weight_per_unit_grams || (['g', 'gms', 'gm', 'grams', 'ml'].includes(dw) ? p.pack_size_value : (['kg', 'ltr', 'l'].includes(dw) ? (p.pack_size_value || 0) * 1000 : 0)) || 0;
    const hasWeightPerUnit = wpug > 0;
    
    if (hasWeightPerUnit) {
      const units = ['pcs'];
      if (hasPacket) units.push('packet');
      if (hasCase)   units.push('case');
      if (isLiquid) {
        units.push('ltr');
        units.push('ml');
      } else {
        units.push('kg');
      }
      return units;
    }

    // Loose/Bulk products get granular weight units (g, kg, ml, ltr)
    const units = isLiquid ? ['ml', 'ltr'] : ['g', 'kg'];
    if (hasPacket) units.push('packet');
    if (hasCase)   units.push('case');
    return units;
  }
  
  return ['pcs'];
}

/**
 * Frontend mirror of the DB convert_to_base_units() function.
 */
export function convertToBaseUnits(
  qty: number,
  sellUnit: string,
  p: Partial<Product>
): number {
  const unitType = p.unit_type || inferUnitType(p);
  const upp = p.units_per_packet || 1;
  const ppc = p.packets_per_case || 1;
  const upc = (upp * ppc) > 1 ? (upp * ppc) : (p.units_per_case || 1);
  const unit = sellUnit.toLowerCase();

  if (unitType === 'kg_g') {
    const psu = (p.pack_size_unit || 'g').toLowerCase();
    const wpug = p.weight_per_unit_grams || 
      (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? p.pack_size_value : 
      (['kg', 'ltr', 'l'].includes(psu) ? (p.pack_size_value || 0) * 1000 : 0)) || 0;

    if (wpug && wpug > 0) {
      if (unit === 'pcs' || unit === 'unit' || unit === 'pouch') return qty;
      if (unit === 'packet' || unit === 'pkt') return qty * upp;
      if (unit === 'case') return qty * upc;
      if (unit === 'g' || unit === 'gms' || unit === 'ml') return qty / wpug;
      if (unit === 'kg' || unit === 'ltr' || unit === 'l') return (qty * 1000) / wpug;
    } else {
      if (unit === 'packet' || unit === 'pkt') return qty * upp;
      if (unit === 'case') return qty * upc;
      if (unit === 'g' || unit === 'gms' || unit === 'ml') return qty;
      if (unit === 'kg' || unit === 'ltr' || unit === 'l') return qty * 1000;
    }
  } else {
    if (unit === 'pcs' || unit === 'unit' || unit === 'pc') return qty;
    if (unit === 'packet') return qty * upp;
    if (unit === 'case') return qty * upc;
  }

  return qty;
}

export interface StockBreakdown {
  cases: number;
  packets: number;
  units: number;
  weightValue: number;
  weightUnit: string;
  isLiquid: boolean;
  hasCases: boolean;
  hasPackets: boolean;
}

/**
 * Returns a detailed breakdown of stock into top/mid/base units.
 */
export function getDetailedStockBreakdown(stockBaseUnits: number, p: Partial<Product>): StockBreakdown {
  const upp = p.units_per_packet || 1;
  const upc = p.units_per_case || (upp * (p.packets_per_case || 1));
  const hasPackets = upp > 1;
  const hasCases = upc > 1;
  const psu = (p.pack_size_unit || 'g').toLowerCase();
  const wpug = p.weight_per_unit_grams || 
    (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? p.pack_size_value : 
    (['kg', 'ltr', 'l'].includes(psu) ? (p.pack_size_value || 0) * 1000 : 0)) || 0;
  
  const dw = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
  const isLiquid = ['ml','ltr','l'].includes(dw);
  
  let cases = 0;
  let packets = 0;
  let units = stockBaseUnits;
  
  if (upc > 1) {
    cases = Math.floor(stockBaseUnits / upc);
    units = stockBaseUnits % upc;
  }
  
  if (upp > 1) {
    packets = Math.floor(units / upp);
    units = units % upp;
  }

  // Weight Calculation
  let weightValue = 0;
  let weightUnit = isLiquid ? 'ltr' : 'kg';
  
  if (wpug && wpug > 0) {
    const totalGrams = stockBaseUnits * wpug;
    if (totalGrams < 1000) {
      weightValue = totalGrams;
      weightUnit = isLiquid ? 'ml' : 'g';
    } else {
      weightValue = totalGrams / 1000;
    }
  } else {
    // Loose bulk
    if (stockBaseUnits < 1000) {
      weightValue = stockBaseUnits;
      weightUnit = isLiquid ? 'ml' : 'g';
    } else {
      weightValue = stockBaseUnits / 1000;
    }
  }

  return {
    cases,
    packets,
    units,
    weightValue,
    weightUnit,
    isLiquid,
    hasCases,
    hasPackets
  };
}

/**
 * Returns a highly compact inventory string for cards/mobile views: CS/PKT/U/KG
 */
export function getCompactStockString(stockBaseUnits: number, p: Partial<Product>): string {
  const breakdown = getDetailedStockBreakdown(stockBaseUnits, p);
  
  const parts: string[] = [];
  
  // Cases
  if (breakdown.hasCases && breakdown.cases > 0) {
     parts.push(`${breakdown.cases}Cs`);
  }
  
  // Packets
  if (breakdown.hasPackets && breakdown.packets > 0) {
    parts.push(`${breakdown.packets}Pkt`);
  }
  
  // Units (Pouch/Jar/etc) - Only show if > 0 OR if we have nothing else
  if (breakdown.units > 0 || parts.length === 0) {
    const rawLabel = getUnitLabel('pcs', p);
    const label = rawLabel === 'Unit/Pcs' ? 'U' : rawLabel === 'Pouch' ? 'P' : rawLabel === 'Jar' ? 'J' : rawLabel.substring(0, 1);
    parts.push(`${breakdown.units}${label}`);
  }
  
  // Weight
  const isWeightApplicable = p.unit_type === 'kg_g' || (p.weight_per_unit_grams || 0) > 0;
  if (isWeightApplicable && stockBaseUnits > 0) {
    const w = breakdown.weightValue >= 10 ? Math.round(breakdown.weightValue) : breakdown.weightValue.toFixed(1);
    parts.push(`${w}${breakdown.weightUnit}`);
  }
  
  return parts.join("/");
}

/**
 * Returns a human-readable stock string appropriate for this product's unit_type.
 */
export function formatStockDisplay(stockBaseUnits: number, p: Partial<Product>): string {
  const unitType = p.unit_type || inferUnitType(p);
  const upp = p.units_per_packet || 1;
  const upc = p.units_per_case || 1;

  if (unitType === 'pcs') {
    if (upc > 1 && stockBaseUnits >= upc) {
      const cases = Math.floor(stockBaseUnits / upc);
      const rem   = Math.round((stockBaseUnits % upc) * 100) / 100;
      return rem > 0 ? `${cases} case${cases > 1 ? 's' : ''} + ${rem} pcs` : `${cases} case${cases > 1 ? 's' : ''}`;
    }
    return `${stockBaseUnits} pcs`;
  }

  if (unitType === 'packet') {
    if (upp > 1) {
      const pkts = Math.floor(stockBaseUnits / upp);
      const rem  = Math.round((stockBaseUnits % upp) * 100) / 100;
      const parts = [];
      if (pkts > 0) parts.push(`${pkts} packet${pkts > 1 ? 's' : ''}`);
      if (rem  > 0) parts.push(`${rem} pcs`);
      return parts.length ? parts.join(' + ') : '0 packets';
    }
    return `${stockBaseUnits} pcs`;
  }

  if (unitType === 'kg_g') {
    const psu = (p.pack_size_unit || 'g').toLowerCase();
    const wpug = p.weight_per_unit_grams || 
      (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? p.pack_size_value : 
      (['kg', 'ltr', 'l'].includes(psu) ? (p.pack_size_value || 0) * 1000 : 0)) || 0;
    const dw   = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
    const isLiquid = ['ml','ltr','l'].includes(dw);

    if (wpug && wpug > 0) {
      const totalGrams = stockBaseUnits * wpug;
      const unitLabel = getUnitLabel('pcs', p);
      if (dw === 'kg' || dw === 'ltr' || totalGrams >= 1000) {
        return `${(totalGrams / 1000).toFixed(3)} ${isLiquid ? 'ltr' : 'kg'} (${stockBaseUnits} ${unitLabel})`;
      }
      return `${totalGrams.toFixed(0)} ${isLiquid ? 'ml' : 'g'} (${stockBaseUnits} ${unitLabel})`;
    } else {
      if (dw === 'kg' || dw === 'ltr' || stockBaseUnits >= 1000) {
        return `${(stockBaseUnits / 1000).toFixed(3)} ${isLiquid ? 'ltr' : 'kg'}`;
      }
      return `${stockBaseUnits.toFixed(0)} ${isLiquid ? 'ml' : 'g'}`;
    }
  }

  return `${stockBaseUnits}`;
}

export function buildPackLabel(p: Partial<Product>): string {
  const info = derivePackaging(p);
  const parts = [];
  
  if (info.midUnit && info.midMultiplier > 1) {
    parts.push(`1 ${info.midUnit} = ${info.midMultiplier} ${info.baseUnit}`);
  }
  
  if (info.midUnit) {
    parts.push(`1 ${info.topUnit} = ${info.topMultiplier} ${info.midUnit}`);
  } else if (info.topMultiplier > 1) {
    parts.push(`1 ${info.topUnit} = ${info.topMultiplier} ${info.baseUnit}`);
  }
  
  return parts.join(" | ");
}

/**
 * Returns a friendly name for a sell unit based on product type.
 */
export function getUnitLabel(u: string, p: Partial<Product> | null): string {
  if (!p) return u;
  const lower = u.toLowerCase();
  
  if (lower === 'pcs' || lower === 'unit' || lower === 'pc') {
    const itemPackType = (p.item_pack_type || '').toLowerCase();
    if (itemPackType === 'pouch') return 'Pouch';
    if (itemPackType === 'jar')   return 'Jar';
    if (itemPackType === 'bottle' || itemPackType === 'btl') return 'Btl';
    if (itemPackType === 'can')    return 'Can';
    return 'Unit';
  }
  
  if (lower === 'packet' || lower === 'pkt') return 'Packet';
  if (lower === 'case' || lower === 'ctn' || lower === 'carton') return 'Case';
  if (lower === 'kg') return 'Kg';
  if (lower === 'ml') return 'Ml';
  if (lower === 'ltr' || lower === 'l') return 'Ltr';
  
  return u;
}

/** @deprecated Use formatStockDisplay instead */
export function formatStockBreakdown(stockUnits: number, p: Partial<Product>): string {
  return formatStockDisplay(stockUnits, p);
}
