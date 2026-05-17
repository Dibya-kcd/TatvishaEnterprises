import { Product } from '@/types';
import { token_set_ratio } from 'fuzzball';

export type InvoiceType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C';

export type ParsedDimensions = {
  product_name: string;
  weight: string | null;
  qty_per_pack: number | null;
  packs_per_carton: number | null;
  total_qty: number | null;
  mrp: number | null;
  packaging: string;
};

export type MatchStatus = 'MATCHED' | 'LOW_CONFIDENCE' | 'UNMATCHED';

export type MatchResult = {
  invoice_text: string;
  detected_type: InvoiceType;
  parsed: ParsedDimensions;
  match_status: MatchStatus;
  matched_product: Product | null;
  match_score: number;
  score_breakdown: {
    name_gate: number;
    pack_size: number;
    qty_per_pack: number;
    packs_per_carton: number;
    total_qty: number;
    mrp: number;
    packaging: number;
  };
  suggestions: {
    product: Product;
    score: number;
    name_score: number; // exposed so UI can sort by relevance
    reason: string;
  }[];
};

// ─── Alias table ────────────────────────────────────────────────────────────
const HINDI_ALIAS_TABLE: Record<string, string> = {
  HALDI: 'TURMERIC',
  MIRCH: 'CHILLI',
  DHANIA: 'CORIANDER',
  JEERA: 'CUMIN',
  'KALI MIRCH': 'BLACK PEPPER',
  'METHI DANA': 'FENUGREEK SEED',
  'KASURI METHI': 'KASURI METHI',
  HING: 'ASAFOETIDA',
  AJWAIN: 'CARAWAY SEED',
  JUANI: 'CARAWAY SEED',
  SAUNF: 'FENNEL SEED',
  POSTAK: 'POPPY SEED',
  'KHUS KHUS': 'POPPY SEED',
  'SENDHA NAMAK': 'ROCK SALT',
  'KALA NAMAK': 'BLACK SALT',
  LEHSUN: 'GARLIC',
  ADRAK: 'GINGER',
  SONTH: 'GINGER',
  DALCHINI: 'CINNAMON',
  'TEJ PATTA': 'BAY LEAF',
  BESAN: 'GRAM FLOUR',
  DALIA: 'WHEAT DALIA',
  ATTA: 'WHEAT FLOUR',
  SABUDANA: 'SABUDANA SAGO',
  SAGO: 'SABUDANA SAGO',
};

// ─── Normalization ────────────────────────────────────────────────────────────
export function normalizeNameForGate(text: string): string {
  let n = text.toUpperCase();

  // Apply Hindi→English aliases (longest match first to avoid partial replacement)
  const keys = Object.keys(HINDI_ALIAS_TABLE).sort((a, b) => b.length - a.length);
  for (const hindi of keys) {
    const regex = new RegExp(`\\b${hindi}\\b`, 'g');
    n = n.replace(regex, HINDI_ALIAS_TABLE[hindi]);
  }

  // Strip digits
  n = n.replace(/[0-9]/g, '');
  // Strip punctuation / brackets
  n = n.replace(/[\][().,\-/X*]/g, ' ');

  // Strip unit fillers
  const fillers = ['GMS', 'GM', 'G', 'KG', 'ML', 'LTR', 'POUCHS', 'POUCH', 'PKD', 'PKTS', 'PKT', 'RS', 'RE', 'PACKS', 'PACK', 'BAG', 'BOX', 'CARTON', 'CASE', 'UNIT', 'PCS'];
  for (const f of fillers) {
    n = n.replace(new RegExp(`\\b${f}\\b`, 'g'), ' ');
  }

  return n.replace(/\s+/g, ' ').trim();
}

// ─── Invoice-type detection ───────────────────────────────────────────────────
function detectInvoiceType(line: string): InvoiceType {
  const u = line.toUpperCase();
  if (/\b(RS|RE)\s*\d+/.test(u) && (u.includes('PKD') || u.includes('POUCH') || u.includes('CHAIN')))
    return 'TYPE_B';
  if (/\[.*?X.*?X.*?\]|X\s*\d+\s*X/.test(u)) return 'TYPE_A';
  return 'TYPE_C';
}

// ─── Dimension parser ─────────────────────────────────────────────────────────
function parseDimensions(line: string, type: InvoiceType): ParsedDimensions {
  const u = line.toUpperCase();

  let weight: string | null = null;
  let qty_per_pack: number | null = null;
  let packs_per_carton: number | null = null;
  let total_qty: number | null = null;
  let mrp: number | null = null;
  let packaging = 'PCS';

  const wm = u.match(/(\d+\.?\d*)\s*(GMS|GM|G|KG)\b/);
  if (wm) weight = wm[1] + (wm[2].toLowerCase().startsWith('g') ? 'g' : 'kg');

  if (type === 'TYPE_B') {
    const mrpM = u.match(/\b(RS|RE)\s*(\d+)/);
    if (mrpM) mrp = parseInt(mrpM[2]);
    const parts = u.match(/(\d+)\s*POUCH\s*X\s*(\d+)\s*PKD|(\d+)\s*X\s*(\d+)/);
    if (parts) {
      qty_per_pack = parseInt(parts[1] || parts[3]);
      packs_per_carton = parseInt(parts[2] || parts[4]);
    }
    const totalM = u.match(/(\d+)\s*P$/);
    if (totalM) total_qty = parseInt(totalM[1]);
    else if (qty_per_pack && packs_per_carton) total_qty = qty_per_pack * packs_per_carton;
    packaging = 'Packet';
  } else if (type === 'TYPE_A') {
    const parts = u.match(/\[?(\d+\.?\d*)\s*(?:GMS|GM|KG)?\s*X\s*(\d+)\s*(?:POUCH|PKT|POUCHS)?\s*X\s*(\d+)\s*(?:PKD|PKT)?\]?/);
    if (parts) {
      qty_per_pack = parseInt(parts[2]);
      packs_per_carton = parseInt(parts[3]);
      total_qty = qty_per_pack * packs_per_carton;
    }
  } else {
    const qm = u.match(/\[(\d+)\]/);
    if (qm) total_qty = parseInt(qm[1]);
  }

  if (u.includes('JAR')) packaging = 'Jar';
  else if (u.includes('SACHET')) packaging = 'PCS';
  else if (u.includes('BAG') || (weight?.includes('kg') && parseFloat(weight) >= 5)) packaging = 'Case';
  else if (u.includes('BOTTLE')) packaging = 'Bottle';
  else if (weight) {
    const wv = parseFloat(weight);
    const wu = weight.replace(/[0-9.]/g, '');
    if (wu === 'g' && wv <= 25) packaging = 'Sachet';
    else if (wu === 'kg' && wv >= 5) packaging = 'Bag';
  }

  return { product_name: normalizeNameForGate(line), weight, qty_per_pack, packs_per_carton, total_qty, mrp, packaging };
}

// ─── Weight comparison ────────────────────────────────────────────────────────
function compareWeights(w1: string | null, w2: string | null): boolean {
  if (!w1 || !w2) return false;
  const parse = (w: string) => {
    const v = parseFloat(w);
    const u = w.replace(/[0-9.]/g, '').toLowerCase();
    return u === 'kg' ? v * 1000 : v;
  };
  const v1 = parse(w1), v2 = parse(w2);
  if (v1 === 0) return v2 === 0;
  return Math.abs(v1 - v2) / v1 <= 0.05;
}

// ─── Normalized catalog type ──────────────────────────────────────────────────
export type NormalizedProduct = Product & { normalized_name: string };

/** Pre-normalize a catalog once; pass result to matchProduct / matchAllRows */
export function buildNormalizedCatalog(catalog: Product[]): NormalizedProduct[] {
  return catalog.map(p => ({ ...p, normalized_name: normalizeNameForGate(p.name) }));
}

// ─── Core match function ──────────────────────────────────────────────────────
export function matchProduct(
  invoiceLine: string,
  catalog: NormalizedProduct[]
): MatchResult {
  const type = detectInvoiceType(invoiceLine);
  const parsed = parseDimensions(invoiceLine, type);
  const normInvoice = parsed.product_name;

  // ── STAGE 1: Gate (raised from 55 → 65 to reduce noise) ──
  const gatePassers = catalog.filter(p => {
    if (p.sku && (invoiceLine.toUpperCase().includes(p.sku.toUpperCase()) || normInvoice.includes(p.sku.toUpperCase()))) return true;
    return token_set_ratio(normInvoice, p.normalized_name) >= 65;
  });

  // ── STAGE 2: Full scoring ──
  const candidates = gatePassers.map(p => {
    const nameScore = token_set_ratio(normInvoice, p.normalized_name);

    const breakdown = {
      name_gate: nameScore,
      pack_size: 0,
      qty_per_pack: 0,
      packs_per_carton: 0,
      total_qty: 0,
      mrp: 0,
      packaging: 0,
    };

    // SKU exact match boost
    if (p.sku && invoiceLine.toUpperCase().includes(p.sku.toUpperCase())) breakdown.name_gate += 100;

    // Chain pack / processing items
    const isChain = p.division_category === 'PROCESSING ITEMS' || p.name.toUpperCase().includes('CHAIN');
    if (type === 'TYPE_B') breakdown.packaging += isChain ? 50 : -50;
    else if (isChain) breakdown.packaging -= 50;

    const catWeight = p.pack_size_value ? `${p.pack_size_value}${p.pack_size_unit || 'g'}` : null;
    if (compareWeights(parsed.weight, catWeight)) breakdown.pack_size = 100;
    if (parsed.qty_per_pack && p.units_per_packet === parsed.qty_per_pack) breakdown.qty_per_pack = 80;
    if (parsed.packs_per_carton && p.packets_per_case === parsed.packs_per_carton) breakdown.packs_per_carton = 80;
    const catTotal = (p.units_per_packet || 1) * (p.packets_per_case || 1);
    if (parsed.total_qty === catTotal) breakdown.total_qty = 60;
    if (type === 'TYPE_B' && parsed.mrp === p.mrp) breakdown.mrp = 70;
    if (p.item_pack_type?.toLowerCase() === parsed.packaging.toLowerCase()) breakdown.packaging += 20;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

    const reasonParts: string[] = [];
    if (breakdown.pack_size > 0) reasonParts.push(parsed.weight!);
    if (breakdown.qty_per_pack > 0) reasonParts.push(`${parsed.qty_per_pack}pc`);
    if (breakdown.packs_per_carton > 0) reasonParts.push(`${parsed.packs_per_carton}pkd`);
    if (breakdown.mrp > 0) reasonParts.push(`Rs.${parsed.mrp}`);

    return { product: p, score, nameScore, breakdown, reason: reasonParts.join('+') || 'Name match' };
  })
    .sort((a, b) => b.score - a.score);

  const top = candidates[0] || null;

  let status: MatchStatus = 'UNMATCHED';
  if (top) {
    if (top.score >= 160) status = 'MATCHED';
    else if (top.score >= 90) status = 'LOW_CONFIDENCE';
  }
  // Ambiguity check
  if (status === 'MATCHED' && candidates.length > 1 && candidates[0].score - candidates[1].score < 25) {
    status = 'LOW_CONFIDENCE';
  }

  // ── Suggestions: sort by name_score DESC so *relevant* products appear first ──
  // Only include candidates with a meaningful name similarity (≥ 60)
  const suggestions = candidates
    .filter(c => c.nameScore >= 60)
    .sort((a, b) => b.nameScore - a.nameScore)
    .slice(0, 5)
    .map(c => ({ product: c.product, score: c.score, name_score: c.nameScore, reason: c.reason }));

  return {
    invoice_text: invoiceLine,
    detected_type: type,
    parsed,
    match_status: status,
    matched_product: status !== 'UNMATCHED' ? top!.product : null,
    match_score: top?.score || 0,
    score_breakdown: top?.breakdown || { name_gate: 0, pack_size: 0, qty_per_pack: 0, packs_per_carton: 0, total_qty: 0, mrp: 0, packaging: 0 },
    suggestions,
  };
}

// ─── Batch match (pre-normalizes catalog once) ───────────────────────────────
export function matchAllRows(lines: string[], catalog: Product[]): MatchResult[] {
  const normalizedCatalog = buildNormalizedCatalog(catalog);
  return lines.map(line => matchProduct(line, normalizedCatalog));
}

// ─── Compatibility ───────────────────────────────────────────────────────────
export function buildProductIndex(products: Product[]): Map<string, Product> {
  const index = new Map<string, Product>();
  products.forEach(p => {
    index.set(p.name.toLowerCase(), p);
    if (p.sku) index.set(p.sku.toLowerCase(), p);
  });
  return index;
}
