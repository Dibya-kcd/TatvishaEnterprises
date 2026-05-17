/**
 * BHARAT MASALA PRICING ENGINE
 * Centralized logic for landed costs, margins, tiered pricing, and RBP/MRP fallbacks.
 */

export type ShopType = "premium" | "gold" | "silver" | "bronze" | "basic";
export type PackType = "pcs" | "packet" | "case" | "kg" | "g" | "ml" | "ltr";
export type LandedCostBasis = 'pcs' | 'case' | 'kg' | 'g' | 'packet';

export interface PricingProduct {
  id: string;
  units_per_packet: number;
  packets_per_case: number;
  mrp?: number;
  is_mrp_priced?: boolean;
  target_margin_premium?: number;
  target_margin_gold?: number;
  target_margin_silver?: number;
  target_margin_bronze?: number;
  target_margin_basic?: number;
  pack_size_value?: number;
  pack_size_unit?: string;
  unit_type?: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams?: number;
}

// ─── Step 1: Base Multipliers ────────────────────────────────────────────────
export function getPackMultiplier(p: PricingProduct, type: PackType): number {
  if (!type || type === "pcs") return 1;
  if (type === "packet") return p.units_per_packet || 1;
  if (type === "case") return (p.units_per_packet || 1) * (p.packets_per_case || 1);
  
  if (type === "kg" || type === "ltr") {
    if (p.weight_per_unit_grams && Number(p.weight_per_unit_grams) > 0) return 1000 / Number(p.weight_per_unit_grams);
    const val = Number(p.pack_size_value) || 0;
    const unit = (p.pack_size_unit || "").toLowerCase();
    if (val > 0) {
      if (['g', 'gms', 'grams', 'gm', 'ml'].includes(unit)) return 1000 / val;
      if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'liter'].includes(unit)) return 1 / val;
    }
    return 1;
  }
  
  if (type === "g" || type === "ml") {
    if (p.weight_per_unit_grams && Number(p.weight_per_unit_grams) > 0) return 1 / Number(p.weight_per_unit_grams);
    const val = Number(p.pack_size_value) || 0;
    const unit = (p.pack_size_unit || "").toLowerCase();
    if (val > 0) {
      if (['g', 'gms', 'grams', 'gm', 'ml'].includes(unit)) return 1 / val;
      if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'liter'].includes(unit)) return 0.001 / val;
    }
    return 0.001;
  }
  
  return 1;
}

// ─── Step 2: Landed cost per level ───────────────────────────────────────────
export function landedCostPerLevel(
  p: PricingProduct, 
  baseLandedCost: number = 0, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): Record<PackType, number> {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;

  const unitsInPacket = p.units_per_packet || 1;
  const packetsInCase = p.packets_per_case || 1;
  const totalUnits = unitsInPacket * packetsInCase;
  const weightPerUnitG = Number(p.weight_per_unit_grams) || 0;

  let costPerUnit: number;

  switch (basis) {
    case 'pcs':
      costPerUnit = baseLandedCost;
      break;

    case 'case':
      costPerUnit = baseLandedCost / (totalUnits || 1);
      break;

    case 'packet':
      costPerUnit = baseLandedCost / (unitsInPacket || 1);
      break;

    case 'kg':
      // Input is ₹ per kg. Convert to ₹ per pcs.
      // costPerUnit = (₹/kg) × (weightPerUnitG / 1000)
      if (weightPerUnitG > 0) {
        costPerUnit = baseLandedCost * (weightPerUnitG / 1000);
      } else {
        // Fallback: no weight data → treat as per-pcs
        console.warn(`[landedCostPerLevel] basis='kg' requested but weight_per_unit_grams is missing for product ${p.id}. Falling back to per-unit.`);
        costPerUnit = baseLandedCost;
      }
      break;

    case 'g':
      if (weightPerUnitG > 0) {
        costPerUnit = baseLandedCost * weightPerUnitG;
      } else {
        costPerUnit = baseLandedCost;
      }
      break;

    default:
      costPerUnit = baseLandedCost / (totalUnits || 1);
  }

  const costPerCase   = costPerUnit * totalUnits;
  const costPerPacket = costPerUnit * unitsInPacket;
  const costPerKg     = weightPerUnitG > 0 ? costPerUnit / (weightPerUnitG / 1000) : 0;
  const costPerG      = weightPerUnitG > 0 ? costPerUnit / weightPerUnitG : 0;
  
  // For liquid products using pack_size_value in ml/ltr:
  const packSizeVal   = Number(p.pack_size_value) || 0;
  const packSizeUnit  = (p.pack_size_unit || '').toLowerCase();
  const packSizeMl    = packSizeUnit === 'ml' ? packSizeVal : (packSizeUnit === 'ltr' || packSizeUnit === 'l') ? packSizeVal * 1000 : 0;
  const costPerMl     = packSizeMl > 0 ? costPerUnit / packSizeMl : 0;
  const costPerLtr    = packSizeMl > 0 ? costPerUnit * (1000 / packSizeMl) : 0;

  return {
    pcs:    costPerUnit,
    packet: costPerPacket,
    case:   costPerCase,
    kg:     costPerKg,
    g:      costPerG,
    ml:     costPerMl,
    ltr:    costPerLtr,
  };
}

/** @deprecated Use basis: LandedCostBasis instead */
export function landedCostPerLevelLegacy(
  p: PricingProduct, 
  baseLandedCost: number = 0, 
  isPerUnit: boolean = false
): Record<PackType, number> {
  return landedCostPerLevel(p, baseLandedCost, isPerUnit ? 'pcs' : 'case');
}

/**
 * Determines the correct landed cost input basis for a product.
 */
export function detectLandedCostBasis(p: PricingProduct): { 
  basis: LandedCostBasis; 
  label: string;        // human-readable, e.g. "per kg" or "per unit"
  hasWeight: boolean;
} {
  const weightG = Number(p.weight_per_unit_grams) || 0;
  const isKgType = p.unit_type === 'kg_g';

  if (weightG > 0) {
    return { basis: 'kg', label: 'per kg', hasWeight: true };
  }

  if (isKgType) {
    // Declared as weight product but weight missing — warn, still default to kg basis
    // so the user can enter the weight and fix it
    console.warn(`[detectLandedCostBasis] Product ${p.id} has unit_type='kg_g' but weight_per_unit_grams is null/0. Defaulting to 'kg' so weight field shows.`);
    return { basis: 'kg', label: 'per kg (⚠ weight missing)', hasWeight: false };
  }

  return { basis: 'pcs', label: 'per unit', hasWeight: false };
}

// ─── Step 3: Selling price from landed cost + margin ─────────────────────────
// Formula: selling_price = landed ÷ (1 − margin%)
export function sellingPrice(
  landedCost: number, 
  marginPct: number,
  roundTo: 0.1 | 0.5 | 1 | 2 | 5 | 10 = 0.5
): number {
  if (isNaN(landedCost) || isNaN(marginPct)) return 0;
  if (marginPct >= 100) return landedCost;
  const factor = 1 - (marginPct / 100);
  if (factor <= 0) return landedCost;
  const raw = landedCost / factor;
  return Math.ceil(raw / roundTo) * roundTo; // Round UP to nearest increment
}

// ─── Step 4: Margin Helpers ──────────────────────────────────────────────────
export function getTargetMargin(p: PricingProduct, shopType: ShopType): number {
  const defaults: Record<ShopType, number> = {
    premium: 3,
    gold:    5,
    silver:  7,
    bronze:  10,
    basic:   15,
  };
  
  if (!shopType || !defaults[shopType]) {
    console.warn(`Unknown shopType: "${shopType}" in getTargetMargin(). Defaulting to silver (7%).`);
    shopType = "silver";
  }

  const fieldMap: Record<ShopType, keyof PricingProduct> = {
    premium: 'target_margin_premium',
    gold: 'target_margin_gold',
    silver: 'target_margin_silver',
    bronze: 'target_margin_bronze',
    basic: 'target_margin_basic'
  };
  
  const val = p[fieldMap[shopType]];
  if (typeof val === 'number' && val > 0) return val;
  
  return defaults[shopType];
}

// ─── Step 4.1: Freight Allocation shared logic ────────────────────────────────
export interface AllocationResult {
  freightAmount: number;
  handlingAmount: number;
  method: "⚖ Weight" | "₹ Invoice" | "N/A";
}

export function getAllocationInfo(opts: {
  itemQty: number;
  itemUnitCost: number;
  itemBaseUnits: number;
  itemWeightGrams: number;
  totalFreight: number;
  totalHandling?: number;
  totalWeightKG: number;
  totalInvoiceValue: number;
  manifestLineCount?: number;
}): AllocationResult {
  const { 
    itemQty, 
    itemUnitCost, 
    itemBaseUnits, 
    itemWeightGrams, 
    totalFreight, 
    totalHandling = 0,
    totalWeightKG, 
    totalInvoiceValue,
    manifestLineCount = 1
  } = opts;
  
  const handlingAmount = totalHandling / manifestLineCount;

  if (itemBaseUnits <= 0 || (totalFreight <= 0 && totalHandling <= 0)) {
    return { freightAmount: 0, handlingAmount, method: "N/A" };
  }

  const itemWeightKG = (itemBaseUnits * (itemWeightGrams || 0)) / 1000;
  const itemValue = itemQty * itemUnitCost;

  if (totalWeightKG > 0 && itemWeightKG > 0) {
    return {
      freightAmount: (itemWeightKG / totalWeightKG) * totalFreight,
      handlingAmount,
      method: "⚖ Weight"
    };
  }

  if (totalInvoiceValue > 0) {
    return {
      freightAmount: (itemValue / totalInvoiceValue) * totalFreight,
      handlingAmount,
      method: "₹ Invoice"
    };
  }

  return { freightAmount: 0, handlingAmount, method: "N/A" };
}

// ─── Step 5: Advanced Tier Price Calculation ──────────────────────────────────
export function calculateTierPrice(
  p: PricingProduct, 
  shopType: ShopType, 
  packType: PackType, 
  baseLandedCost: number, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): number {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;
    
  const lc = landedCostPerLevel(p, baseLandedCost, basis);
  const margin = getTargetMargin(p, shopType);
  const landed = lc[packType] || 0;
  
  if (landed <= 0) return 0;
  return sellingPrice(landed, margin);
}

// ─── Step 6: Generate ALL tier prices for a product ──────────────────────────
export function autoCalcAllTiers(
  p: PricingProduct, 
  baseLandedCost: number, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): {
  shop_type: ShopType;
  pack_type: PackType;
  landed_cost: number;
  price: number;
  margin_pct: number;
}[] {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;
    
  const lc = landedCostPerLevel(p, baseLandedCost, basis);
  const shopTypes: ShopType[] = ["premium", "gold", "silver", "bronze", "basic"];
  const packTypes: PackType[] = ["pcs", "packet", "case", "kg", "g", "ml", "ltr"];

  const result = [];
  for (const st of shopTypes) {
    const margin = getTargetMargin(p, st);
    for (const pt of packTypes) {
      const landed = lc[pt];
      const price = sellingPrice(landed, margin);
      if (price > 0) {
        result.push({
          shop_type: st,
          pack_type: pt,
          landed_cost: landed,
          price,
          margin_pct: margin,
        });
      }
    }
  }
  return result;
}

// ─── Step 7: Price resolution at order time ───────────────────────────────────
export function resolvePrice(opts: {
  product:       PricingProduct;
  packType:      PackType;
  shopType:      ShopType;
  savedTiers?:    Map<string, number>;       // key: `${shopType}:${packType}`
  shopOverride?: number | null;
  rbpFallback?:  number | null;
  landedCost?:   number | null;
}): { price: number; source: 'override' | 'tier' | 'auto' | 'rbp' } {
  const { product, packType, shopType, savedTiers, shopOverride, rbpFallback, landedCost } = opts;

  if (shopOverride != null && shopOverride > 0 && !isNaN(shopOverride)) return { price: shopOverride, source: 'override' };

  const tier = savedTiers?.get(`${shopType}:${packType}`);
  if (tier != null && tier > 0) return { price: tier, source: 'tier' };

  if (rbpFallback != null && rbpFallback > 0) return { price: rbpFallback, source: 'rbp' };

  // Calculate based on landed cost and margin if available
  if (landedCost != null && landedCost > 0) {
    const price = calculateTierPrice(product, shopType, packType, landedCost, true);
    if (price > 0) return { price, source: 'auto' };
  }

  // Fallback to MRP based price if set
  if (product.mrp && product.mrp > 0) {
    const mult = getPackMultiplier(product, packType);
    const price = mrpBasedPrice(product.mrp * mult, shopType);
    return { price, source: 'auto' };
  }

  // Fallback to 0 if nothing else works
  return { price: 0, source: 'rbp' };
}

// ─── Step 8: WAC Calculation ───────────────────────────────────────────────────
export function computeWacClient(
  existingQty: number,           // in pcs
  existingWacPerPcs: number,     // ₹ per pcs (what's in products.cost_price)
  newQtyPcs: number,             // new batch qty in pcs
  newLandedCostInput: number,    // raw input (could be ₹/kg or ₹/pcs)
  product: PricingProduct        // needed to convert kg→pcs if required
): { 
  blendedWacPerPcs: number; 
  blendedWacPerKg: number | null;  // null if no weight data
  deltaPct: number; 
  deltaAbs: number;
  inputBasis: LandedCostBasis;
  newLandedPerPcs: number;
} {
  const { basis } = detectLandedCostBasis(product);
  
  // Step 1: Convert newLandedCostInput → per-pcs
  const levels = landedCostPerLevel(product, newLandedCostInput, basis);
  const newLandedPerPcs = levels.pcs;

  // Step 2: WAC blend in per-pcs space
  const total = existingQty + newQtyPcs;
  const blendedWacPerPcs = total === 0 ? newLandedPerPcs
    : ((existingQty * existingWacPerPcs) + (newQtyPcs * newLandedPerPcs)) / total;

  // Step 3: Also express in per-kg for display (if weight available)
  const weightG = Number(product.weight_per_unit_grams) || 0;
  const blendedWacPerKg = weightG > 0 ? blendedWacPerPcs * (1000 / weightG) : null;

  const deltaPct = existingWacPerPcs > 0
    ? ((blendedWacPerPcs - existingWacPerPcs) / existingWacPerPcs) * 100
    : 0;

  return {
    blendedWacPerPcs,
    blendedWacPerKg,
    deltaPct: Math.round(deltaPct * 100) / 100,
    deltaAbs: blendedWacPerPcs - existingWacPerPcs,
    inputBasis: basis,
    newLandedPerPcs,
  };
}

// ─── Step 9: Utils ───────────────────────────────────────────────────────────
export function actualMarginPct(price: number, landedCost: number): number {
  if (price <= 0 || price <= landedCost) return 0;
  return Math.round(((price - landedCost) / price) * 100 * 10) / 10;
}

export function mrpBasedPrice(mrp: number, shopType: ShopType): number {
  if (isNaN(mrp)) return 0;
  const discounts: Record<ShopType, number> = {
    premium: 0.60,
    gold:    0.70,
    silver:  0.80,
    bronze:  0.85,
    basic:   0.95,
  };
  return Math.round(mrp * (discounts[shopType] || 0.8) * 100) / 100;
}

// Backward Compatibility Alias
export const calculateLandedUnitPrice = (p: PricingProduct) => {
  const lc = landedCostPerLevel(p);
  return lc.pcs;
};
