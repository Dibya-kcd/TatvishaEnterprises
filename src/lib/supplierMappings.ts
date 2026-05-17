
import { supabase } from "@/integrations/supabase/client";

export type MappingEntry = { raw_name: string; product_id: string; confidence: number };

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
}

export async function loadTemplate(supplierName: string): Promise<MappingEntry[]> {
  const { data, error } = await supabase
    .from('import_mapping_templates')
    .select('mapping')
    .ilike('supplier', supplierName)
    .maybeSingle();

  if (error || !data) return [];
  // The mapping field in DB is jsonb
  return (data.mapping as MappingEntry[]) || [];
}

export async function saveTemplate(supplierName: string, entries: MappingEntry[]): Promise<void> {
  const { error } = await supabase
    .from('import_mapping_templates')
    .upsert({
      supplier: supplierName,
      mapping: entries as unknown as Record<string, unknown>[],
      updated_at: new Date().toISOString()
    }, { onConflict: 'supplier' });

  if (error) throw error;
}

export async function recordCorrection(
  rawName: string, 
  productId: string, 
  supplierName: string
): Promise<void> {
  if (!supplierName) return;
  const entries = await loadTemplate(supplierName);
  const normalizedRaw = normalize(rawName);
  
  const existingIdx = entries.findIndex(e => normalize(e.raw_name) === normalizedRaw);
  if (existingIdx > -1) {
    entries[existingIdx].product_id = productId;
    entries[existingIdx].confidence = 100;
  } else {
    entries.push({ raw_name: rawName, product_id: productId, confidence: 100 });
  }

  await saveTemplate(supplierName, entries);
}

export async function getLearnedMap(supplierName: string): Promise<Map<string, string>> {
  const entries = await loadTemplate(supplierName);
  const map = new Map<string, string>();
  entries.forEach(e => {
    map.set(normalize(e.raw_name), e.product_id);
  });
  return map;
}
