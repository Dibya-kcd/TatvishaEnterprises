import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export type ImportStatus = 'valid' | 'warning' | 'error';

export interface MappedProduct {
  name?: string;
  sku?: string;
  mrp: number;
  gst_rate: number;
  division_category?: string;
  hsn?: string;
  item_pack_type?: string;
  pack_size_value?: number;
  pack_size_unit?: string;
  base_unit?: string;
  unit?: string;
  brand: string;
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  case_qty_value?: number;
  case_qty_unit?: string;
  preferred_sell_unit: string;
  min_stock: number;
  division?: string;
  is_chain_item: boolean;
  is_mrp_priced: boolean;
  is_active: boolean;
  chain_mrp_label?: string;
  batch_number?: string;
  sub_category?: string;
  opening_stock?: number;
  base_weight_unit?: string | null;
  unit_type: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams: number | null;
  display_weight_unit: "g" | "kg" | "ml" | "ltr" | null;
  target_margin_basic?: number;
  target_margin_bronze?: number;
  target_margin_silver?: number;
  target_margin_gold?: number;
  target_margin_premium?: number;
}

export interface ImportRowResult {
  row_index: number;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
  mapped_data: MappedProduct;
}

export interface ImportSummary {
  total: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  rows: ImportRowResult[];
  mappings: Record<string, string | null>;
  available_headers: string[];
}

const MANDATORY_MAPPINGS = ['Product Name', 'SKU'];
const OPTIONAL_MAPPINGS = [
  'MRP', 'GST Rate (%)', 'Category', 'Sub Category', 'HSN Code', 'Unit Label', 'Item Pack Type', 
  'Unit Pack Size', 'Pack Size', 'Pack Size Unit', 'Base Unit', 'Base Unit (pcs)', 'Unit', 'Brand', 'Units per Pack', 'Units per Packet', 
  'Packs per Case', 'Pack per Case', 'Units/Case', 'Qty in Case', 'QTY Case', 'QTY BAG/CARTON', 'QTY BAG/CARTOON', 'QTY Case/Carton', 'QTY/CARTOON', 'Preferred Sell Unit', 
  'Min Stock', 'Opening Stock', 'Batch Number', 'Active', 'Chain Pack?', 'Chain MRP Label',
  'Margin Basic', 'Margin Bronze', 'Margin Silver', 'Margin Gold', 'Margin Premium'
];
const ALL_SYSTEM_COLUMNS = [...MANDATORY_MAPPINGS, ...OPTIONAL_MAPPINGS];

export const productImportService = {
  /**
   * Parse a file (XLSX or CSV) from a buffer
   */
  async parseFile(buffer: ArrayBuffer, filename: string, userMappings?: Record<string, string>): Promise<ImportSummary> {
    const isCsv = filename.toLowerCase().endsWith('.csv');
    let data: Record<string, unknown>[] = [];
    let available_headers: string[] = [];

    if (isCsv) {
      const decoder = new TextDecoder('utf-8');
      const csvString = decoder.decode(buffer);
      const result = Papa.parse<Record<string, unknown>>(csvString, { header: true, skipEmptyLines: true });
      data = result.data;
      available_headers = result.meta.fields || [];
    } else {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      if (data.length > 0) {
        available_headers = Object.keys(data[0]);
      }
    }

    // Determine mappings if not provided
    const mappings: Record<string, string | null> = {};
    ALL_SYSTEM_COLUMNS.forEach(sysCol => {
      if (userMappings && userMappings[sysCol]) {
        mappings[sysCol] = userMappings[sysCol];
      } else {
        const match = available_headers.find(h => 
          h.trim().toLowerCase().includes(sysCol.toLowerCase()) || 
          sysCol.toLowerCase().includes(h.trim().toLowerCase())
        );
        mappings[sysCol] = match || null;
      }
    });

    return {
      ...this.processData(data, mappings),
      mappings,
      available_headers
    };
  },

  /**
   * Process raw data rows into structured import results
   */
  processData(data: Record<string, unknown>[], mappings: Record<string, string | null>): Omit<ImportSummary, 'mappings' | 'available_headers'> {
    const rows: ImportRowResult[] = [];
    const seenSkus = new Set<string>();

    data.forEach((row, index) => {
      if (index === 0 && row[Object.keys(row)[0]] === "EXAMPLE - DO NOT REMOVE") {
        return; // Skip example row
      }
      const processed = this.processRow(row, index + 1, seenSkus, mappings);
      rows.push(processed);
      if (processed.mapped_data.sku) {
        seenSkus.add(processed.mapped_data.sku.toUpperCase());
      }
    });

    return {
      total: rows.length,
      valid_count: rows.filter(r => r.status === 'valid').length,
      warning_count: rows.filter(r => r.status === 'warning').length,
      error_count: rows.filter(r => r.status === 'error').length,
      rows
    };
  },

  /**
   * Process a single row with validation and mapping
   */
  processRow(row: Record<string, unknown>, rowIndex: number, seenSkusInFile: Set<string>, mappings: Record<string, string | null>): ImportRowResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ITEM_PACK_TYPE_OPTIONS = ['packet', 'jar', 'bottle', 'bag', 'box', 'tin', 'can', 'kg', 'pcs'];

    const mapped: MappedProduct = {
      mrp: 0,
      gst_rate: 0,
      brand: 'Tatvisha Enterprises',
      units_per_packet: 1,
      packets_per_case: 1,
      units_per_case: 1,
      preferred_sell_unit: 'packet',
      min_stock: 0,
      is_chain_item: false,
      is_mrp_priced: false,
      is_active: true,
      opening_stock: 0,
      unit_type: 'pcs',
      weight_per_unit_grams: null,
      display_weight_unit: null
    };

    // Header Mapping & Normalization using the mappings passed from parseFile
    const getVal = (systemKey: string): string | number | undefined => {
      const fileKey = mappings[systemKey];
      return fileKey ? (row[fileKey] as string | number | undefined) : undefined;
    };

    // Mandatory checks
    const name = getVal('Product Name') || getVal('Product Name ?');
    const sku = getVal('SKU') || getVal('SKU Code ?');

    if (!name || String(name).trim() === '') {
      errors.push("Product Name is mandatory");
    } else {
      mapped.name = String(name).trim();
    }

    if (!sku || String(sku).trim() === '') {
      errors.push("SKU is mandatory");
    } else {
      const skuStr = String(sku).trim().toUpperCase();
      if (seenSkusInFile.has(skuStr)) {
        errors.push(`Duplicate SKU in file: ${skuStr}`);
      }
      mapped.sku = skuStr;
    }

    // Standard fields
    mapped.mrp = Number(getVal('MRP') ?? 0);
    if (mapped.mrp === 0) warnings.push("MRP is 0 (Check if chain pack)");

    mapped.gst_rate = Number(getVal('GST Rate (%)') ?? 0);
    
    mapped.division_category = getVal('Category') as string | undefined;
    if (!mapped.division_category) warnings.push("Category is missing");

    mapped.sub_category = getVal('Sub Category') as string | undefined;

    // HSN parsing
    const hsn = getVal('HSN Code');
    if (hsn != null) {
      const hsnNum = Number(hsn);
      if (!isNaN(hsnNum)) {
        mapped.hsn = String(Math.floor(hsnNum));
      } else {
        mapped.hsn = String(hsn).trim();
      }
    }

    // Item Pack Type (Unit Label in CSV)
    const iptRaw = (getVal('Unit Label') || getVal('Item Pack Type') || 'Packet').toString().trim();
    mapped.item_pack_type = iptRaw;
    
    const iptLower = iptRaw.toLowerCase();
    if (!ITEM_PACK_TYPE_OPTIONS.some(opt => iptLower.includes(opt))) {
      warnings.push(`Unusual Item Pack Type: ${iptRaw}. Standard types: ${ITEM_PACK_TYPE_OPTIONS.join(', ')}`);
    }

    // Pack Size Parsing (Unit Pack Size in CSV)
    const packSizeStr = getVal('Unit Pack Size') || getVal('Pack Size');
    const packSizeUnitExplicit = getVal('Pack Size Unit');

    if (packSizeStr) {
      const match = String(packSizeStr).match(/(\d+\.?\d*)\s*(gms?|g|kg|ml|ltr|l|pcs|packets?|pc)/i);
      if (match) {
        mapped.pack_size_value = Number(match[1]);
        if (!packSizeUnitExplicit) {
          let unit = match[2].toLowerCase();
          // Standardize variations to 'g' or 'Kg'
          if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
          if (unit.startsWith('kg')) unit = 'Kg';
          if (unit.startsWith('l')) unit = 'ltr';
          mapped.pack_size_unit = unit;
        }
      } else {
        const numVal = Number(packSizeStr);
        if (!isNaN(numVal)) {
          mapped.pack_size_value = numVal;
        }
      }
    }

    if (packSizeUnitExplicit) {
      let unit = String(packSizeUnitExplicit).toLowerCase().replace(/[0-9\s]/g, '');
      if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
      if (unit === 'kg') unit = 'Kg';
      if (unit.includes('ltr') || unit.includes('lit')) unit = 'ltr';
      if (unit.includes('pc')) unit = 'pcs';
      mapped.pack_size_unit = unit || mapped.pack_size_unit;
    }

    // Standardize pack_size_unit and sync base_weight_unit
    const finalUnit = (mapped.pack_size_unit || "").toLowerCase();
    if (finalUnit === "g" || finalUnit === "gms" || finalUnit === ".gms") {
      mapped.pack_size_unit = "g";
      mapped.base_weight_unit = "g";
      mapped.display_weight_unit = "g";
    } else if (finalUnit === "kg" || finalUnit === "kgs") {
      mapped.pack_size_unit = "Kg";
      mapped.base_weight_unit = "Kg";
      mapped.display_weight_unit = "kg";
    } else if (finalUnit === "ml") {
      mapped.display_weight_unit = "ml";
    } else if (finalUnit === "ltr" || finalUnit === "l") {
      mapped.display_weight_unit = "ltr";
    } else {
      mapped.base_weight_unit = null;
      mapped.display_weight_unit = null;
    }

    // Determine weight_per_unit_grams
    const val = Number(mapped.pack_size_value) || 0;
    if (mapped.display_weight_unit === 'kg' || mapped.display_weight_unit === 'ltr') {
      mapped.weight_per_unit_grams = val * 1000;
    } else if (mapped.display_weight_unit) {
      mapped.weight_per_unit_grams = val;
    } else {
      mapped.weight_per_unit_grams = null;
    }

    mapped.base_unit = (getVal('Base Unit (pcs)') || getVal('Base Unit') || getVal('Unit')) as string | undefined;
    mapped.unit = mapped.base_unit;
    mapped.brand = (getVal('Brand') as string) || 'Tatvisha Enterprises';

    // Hierarchy
    mapped.units_per_packet = Number(getVal('Units per Pack') || getVal('Units per Packet') || 1);
    mapped.packets_per_case = Number(getVal('Packs per Case') || getVal('Pack per Case') || 1);
    
    // Determine unit_type
    const isWeighted = mapped.display_weight_unit !== null;
    if (isWeighted) {
      mapped.unit_type = 'kg_g';
    } else if (mapped.units_per_packet > 1) {
      mapped.unit_type = 'packet';
    } else {
      mapped.unit_type = 'pcs';
    }
    
    const unitsPerCaseProvided = getVal('Units/Case') || getVal('QTY Case') || getVal('QTY BAG/CARTON') || getVal('QTY BAG/CARTOON') || getVal('QTY Case/Carton') || getVal('QTY/CARTOON');
    const calculatedUPC = mapped.units_per_packet * mapped.packets_per_case;
    
    if (unitsPerCaseProvided != null) {
      mapped.units_per_case = Number(unitsPerCaseProvided);
      if (mapped.units_per_case !== calculatedUPC) {
        warnings.push(`Units/Case (${mapped.units_per_case}) differs from UPP×PPC (${calculatedUPC}). Using provided value.`);
      }
    } else {
      mapped.units_per_case = calculatedUPC;
    }

    // Auto-derivation of Division from SKU
    // Logic: BS, BL, WS, etc. usually at start or after first hyphen
    if (mapped.sku) {
      const sku = mapped.sku.toUpperCase();
      if (sku.startsWith('BS') || sku.includes('-BS')) mapped.division = 'BS';
      else if (sku.startsWith('BL') || sku.includes('-BL')) mapped.division = 'BL';
      else if (sku.startsWith('WS') || sku.includes('-WS')) mapped.division = 'WS';
      else if (sku.startsWith('CP') || sku.includes('-CP')) mapped.division = 'CP';
      else {
        const parts = sku.split('-');
        if (parts.length >= 2) mapped.division = parts[1];
      }
    }

    // Qty in Case parsing
    const qtyInCaseStr = getVal('Qty in Case') || getVal('QTY Case') || getVal('QTY BAG/CARTON') || getVal('QTY BAG/CARTOON') || getVal('QTY Case/Carton') || getVal('QTY/CARTOON');
    if (qtyInCaseStr != null && qtyInCaseStr !== '') {
      const strVal = String(qtyInCaseStr).trim();
      const match = strVal.match(/^(\d+\.?\d*)\s*(kg|kgs|kilograms?|pkt|pkts|packets?|pcs|units?|units?|gms?|grams?|g)?$/i);
      
      if (match) {
        mapped.case_qty_value = Number(match[1]);
        let unit = (match[2] || '').toLowerCase();
        
        // Normalize unit
        if (unit.startsWith('kg')) unit = 'kg';
        else if (unit.startsWith('pkt') || unit.startsWith('packet')) unit = 'packet';
        else if (unit.startsWith('pcs') || unit.startsWith('unit') || unit.startsWith('pc')) unit = 'pcs';
        else if (unit.startsWith('g')) unit = 'g';
        
        // Defaulting if no unit provided
        if (!unit) {
          if (mapped.pack_size_unit === 'g' || mapped.pack_size_unit === 'kg') {
            unit = 'kg';
          } else {
            unit = 'packet';
          }
        }
        
        mapped.case_qty_unit = unit;
      } else {
        // Just in case it's a number but somehow didn't match the regex anchor
        const numVal = Number(strVal);
        if (!isNaN(numVal)) {
          mapped.case_qty_value = numVal;
          mapped.case_qty_unit = (mapped.pack_size_unit === 'g' || mapped.pack_size_unit === 'kg') ? 'kg' : 'packet';
        }
      }
    }

    // Preferred Sell Unit
    let psu = String(getVal('Preferred Sell Unit') || 'packet').toLowerCase().trim();
    if (psu === 'pkt' || psu === 'pouch' || psu === 'packet' || psu === 'sachet' || psu === 'pack') psu = 'packet';
    if (psu === 'pcs' || psu === 'unit' || psu === 'pc') psu = 'pcs';
    if (psu === 'case' || psu === 'carton' || psu === 'box') psu = 'case';
    if (psu === 'kg' || psu === 'kilogram' || psu === 'kgs') psu = 'kg';
    mapped.preferred_sell_unit = psu;

    mapped.min_stock = Number(getVal('Min Stock') || 10);
    mapped.batch_number = getVal('Batch Number') as string | undefined;
    
    const activeVal = getVal('Active');
    if (activeVal !== undefined) {
      const activeStr = String(activeVal).toLowerCase();
      mapped.is_active = activeStr === 'yes' || activeStr === 'true' || activeStr === '1' || activeStr === 'active';
    }

    // Margin Tiers
    mapped.target_margin_basic = Number(getVal('Margin Basic') || 0);
    mapped.target_margin_bronze = Number(getVal('Margin Bronze') || 0);
    mapped.target_margin_silver = Number(getVal('Margin Silver') || 0);
    mapped.target_margin_gold = Number(getVal('Margin Gold') || 0);
    mapped.target_margin_premium = Number(getVal('Margin Premium') || 0);
    
    // Inventory
    const openingStock = Number(getVal('Opening Stock') || 0);
    mapped.opening_stock = openingStock;
    if (openingStock === 0) warnings.push("Opening Stock is 0");

    const nameLower = (mapped.name || "").toLowerCase();
    // Rule: ACB is NOT a chain item. Chain items are specific names.
    const isChainName = nameLower.includes('chain pack') || nameLower.includes('cb items') || nameLower.includes('chainpack');
    
    // Explicit Chain MRP Label mapping or manual override
    const explicitChainLabel = getVal('Chain MRP Label');
    const explicitIsChain = getVal('Chain Pack?'); 
    
    // 1. Determine if Chain Item
    if (explicitIsChain !== undefined) {
      const isChainStr = String(explicitIsChain).toLowerCase();
      mapped.is_chain_item = isChainStr === 'yes' || isChainStr === 'true' || isChainStr === '1';
    } else {
      mapped.is_chain_item = isChainName && !nameLower.includes('[acb]');
    }

    // Rule: is_mrp_priced should be true if it has an MRP > 0
    mapped.is_mrp_priced = (Number(mapped.mrp) > 0) || mapped.is_chain_item;

    // 2. Clear Chain MRP Label if not a chain item
    if (mapped.is_chain_item) {
      if (explicitChainLabel) {
        mapped.chain_mrp_label = String(explicitChainLabel);
      } else if (packSizeStr || mapped.sku) {
        // Improved regex for label extraction: Rs/Re with flexibility for dots, slashes and piece counts
        const labelMatch = (mapped.name + " " + String(packSizeStr || "")).match(/(Rs?\.?|Re\.?)\s*\d+\s*[/-]*(\s*\(\d+p[cs]\))?/i);
        if (labelMatch) {
          mapped.chain_mrp_label = labelMatch[0].trim();
        }
      }
    } else {
      mapped.chain_mrp_label = null;
    }

    // 3. Preferred Sell Unit Logic
    // Rule: if "pc" or "pcs" is in name, forced to "packet"
    // Rule: ACB items typically "unit" (but if has pc, "packet" wins?)
    const hasPcsInName = nameLower.includes('pc') || nameLower.includes('pcs');
    
    if (hasPcsInName) {
      mapped.preferred_sell_unit = 'packet';
    } else if (iptLower.includes('acb') || iptLower.includes('jar') || iptLower.includes('tin') || iptLower.includes('bottle')) {
      mapped.preferred_sell_unit = 'pcs';
    } else {
      // Default to what is in the sheet or 'packet'
      const rawPSU = getVal('Preferred Sell Unit');
      const sheetPSU = String(rawPSU || 'packet').toLowerCase();
      if (sheetPSU.includes('pcs') || sheetPSU.includes('unit')) mapped.preferred_sell_unit = 'pcs';
      else if (sheetPSU.includes('case') || sheetPSU.includes('carton')) mapped.preferred_sell_unit = 'case';
      else if (sheetPSU.includes('kg')) mapped.preferred_sell_unit = 'kg';
      else mapped.preferred_sell_unit = 'packet';
    }

    // Determine Status
    let status: ImportStatus = 'valid';
    if (errors.length > 0) status = 'error';
    else if (warnings.length > 0) status = 'warning';

    return {
      row_index: rowIndex,
      status,
      errors,
      warnings,
      mapped_data: mapped
    };
  }
};
