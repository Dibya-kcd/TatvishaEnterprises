import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { 
  type PackType, 
  type PricingProduct, 
  getPackMultiplier, 
  landedCostPerLevel, 
  autoCalcAllTiers, 
  getAllocationInfo,
  detectLandedCostBasis
} from "@/lib/pricing";
import { 
  extractInvoiceFromCSV, 
  extractInvoiceFromMedia, 
  extractInvoiceFromText 
} from "@/services/geminiService";
import { type Product } from "@/types";
import { buildNormalizedCatalog, matchProduct, type MatchResult, type MatchStatus } from '@/lib/grnMatcher';
import { getLearnedMap, recordCorrection } from '@/lib/supplierMappings';

export type StockItem = {
  id: string; 
  productId: string;
  name: string;
  sku: string;
  quantity: number; 
  unitCost: number; 
  expiryDate: string;
  packedDate?: string; // MMYY
  packType: PackType;
  unitsPerPacket: number;
  packetsPerCase: number;
  pack_size_value?: number | null;
  pack_size_unit?: string | null;
  mrp?: number;
  unit_type?: "pcs" | "packet" | "kg_g" | null;
  freightTotal?: number;
  handlingTotal?: number;
  taxPct?: number;
};

export type ExtractedItem = {
  sku_or_name: string;
  quantity: number;
  pack_type: PackType;
  cost_per_pack: number;
  expiry_date: string;
  extracted_multipliers?: {
    units_per_packet?: number;
    packets_per_case?: number;
  };
};

export const parseMMYY = (raw: string): { mm: number; yyyy: number } | null => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const mm = Number(digits.slice(0, 2));
  const yy = Number(digits.slice(2, 4));
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { mm, yyyy: 2000 + yy };
};

export const mmyyToIsoExpiryDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  const lastDay = new Date(p.yyyy, p.mm, 0).getDate();
  return `${p.yyyy}-${String(p.mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

export const addMonthsMMYY = (raw: string, months: number): string => {
  const p = parseMMYY(raw);
  if (!p) return raw;
  const date = new Date(p.yyyy, p.mm - 1, 1);
  date.setMonth(date.getMonth() + months);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return mm + yy;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function useStockImport(products: Product[]) {
  const { user, isAdmin } = useAuth();
  
  const [items, setItems] = React.useState<StockItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [supplierName, setSupplierName] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [totalFreight, setTotalFreight] = React.useState("0");
  const [totalHandling, setTotalHandling] = React.useState("0");
  const [globalPackedDate, setGlobalPackedDate] = React.useState("");

  const [parsing, setParsing] = React.useState(false);
  const [pendingItems, setPendingItems] = React.useState<ExtractedItem[]>([]);
  const [isBulkImportOpen, setIsBulkImportOpen] = React.useState(false);
  const [bulkStep, setBulkStep] = React.useState<1 | 2 | 3>(1);

  const stats = React.useMemo(() => {
    let totalBaseUnits = 0;
    let totalInvoicedValue = 0;
    let totalWeight = 0;
    let totalExpectedGrs = 0;

    // First pass: totals
    items.forEach(item => {
      const p = products.find(px => px.id === item.productId);
      const pricingProd: PricingProduct = {
        id: item.productId,
        units_per_packet: item.unitsPerPacket,
        packets_per_case: item.packetsPerCase,
        mrp: p?.mrp,
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit
      };

      const multiplier = getPackMultiplier(pricingProd, item.packType);
      const units = (Number(item.quantity) || 0) * multiplier;
      totalBaseUnits += units;
      totalInvoicedValue += (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);

      const weightUnit = p?.pack_size_unit?.toLowerCase();
      const weightFactor = (weightUnit === 'g' || weightUnit === 'gms' || weightUnit === 'grams' || weightUnit === 'ml') ? 1/1000 : 1;
      const itemWeightKg = (units * (p?.pack_size_value || 0) * weightFactor);
      totalWeight += itemWeightKg;
    });

    // Second pass: profits with allocated costs
    items.forEach(item => {
      const p = products.find(px => px.id === item.productId);
      const pricingProd: PricingProduct = {
        id: item.productId,
        units_per_packet: item.unitsPerPacket,
        packets_per_case: item.packetsPerCase,
        mrp: p?.mrp,
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit
      };

      const multiplier = getPackMultiplier(pricingProd, item.packType);
      const units = (Number(item.quantity) || 0) * multiplier;

      const allocation = getAllocationInfo({
        itemQty: Number(item.quantity) || 0,
        itemUnitCost: Number(item.unitCost) || 0,
        itemBaseUnits: units,
        itemWeightGrams: (p?.pack_size_value && p?.pack_size_unit?.toLowerCase().startsWith('g')) ? p.pack_size_value : (p?.pack_size_value || 0) * 1000,
        totalFreight: Number(totalFreight) || 0,
        totalHandling: Number(totalHandling) || 0,
        totalWeightKG: totalWeight,
        totalInvoiceValue: totalInvoicedValue,
        manifestLineCount: items.length
      });

      const invoicedCostPerPack = Number(item.unitCost) || 0;
      const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
      const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;
      
      const landedPerPack = invoicedCostPerPack + (freightForLine / (Number(item.quantity) || 1)) + (handlingForLine / (Number(item.quantity) || 1));
      const landedPerPcs = multiplier > 0 ? landedPerPack / multiplier : landedPerPack;

      const tiers = autoCalcAllTiers(pricingProd, landedPerPcs, 'pcs');
      const bronzePrice = tiers.find(t => t.shop_type === "bronze" && t.pack_type === "pcs")?.price || (landedPerPcs / 0.65);
      totalExpectedGrs += bronzePrice * units;
    });

    const avgProfit = totalExpectedGrs > 0 ? ((totalExpectedGrs - (totalInvoicedValue + Number(totalFreight) + Number(totalHandling))) / totalExpectedGrs * 100) : 0;

    return { totalBaseUnits, totalInvoicedValue, totalWeight, avgProfit };
  }, [items, products, totalFreight, totalHandling]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    const toastId = toast.loading(`Processing ${file.name}...`);
    
    try {
      let result: unknown = null;
      if (file.name.endsWith(".csv") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const reader = new FileReader();
        const data = await new Promise((resolve) => {
          reader.onload = (e) => resolve(e.target?.result);
          reader.readAsArrayBuffer(file);
        });
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        result = await extractInvoiceFromCSV(csv);
      } else if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        result = await extractInvoiceFromMedia(base64, file.type);
      } else if (file.type === "application/pdf") {
        const base64 = await fileToBase64(file);
        result = await extractInvoiceFromMedia(base64, file.type);
      }

      if (result) {
        const res = result as Record<string, unknown>;
        if (res.invoice_number) setInvoiceNumber(String(res.invoice_number));
        if (res.supplier_name) setSupplierName(String(res.supplier_name));
        if (res.invoice_date) setInvoiceDate(String(res.invoice_date));
        if (res.total_freight) setTotalFreight(String(res.total_freight));
        if (res.total_handling) setTotalHandling(String(res.total_handling));
        if (res.items) {
          // Prevent duplicates if pendingItems already has data? 
          // Actually, handleFileUpload usually replaces or appends? 
          // Let's replace pendingItems to be safe for a single file upload.
          setPendingItems(res.items as ExtractedItem[]);
          setBulkStep(2);
          setIsBulkImportOpen(true);
        }
        toast.success("Ready for review", { id: toastId });
      } else {
        throw new Error("No data extracted");
      }
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const onPasteExtract = async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    const tid = toast.loading("AI interpretation in progress...");
    try {
      const result = await extractInvoiceFromText(text);
      if (result) {
        if (result.invoice_number) setInvoiceNumber(result.invoice_number);
        if (result.supplier_name) setSupplierName(result.supplier_name);
        if (result.items) {
          setPendingItems(result.items);
          setBulkStep(2);
          toast.success("Review extraction mappings", { id: tid });
        }
      }
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: tid });
    } finally {
      setParsing(false);
    }
  };

  const confirmMapping = (newItems: Omit<StockItem, "id">[]) => {
    const hyd = newItems.map(it => {
      const p = products.find(px => px.id === it.productId);
      return { 
        ...it, 
        id: crypto.randomUUID(),
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit,
        mrp: p?.mrp,
        unit_type: p?.unit_type
      };
    });
    setItems(prev => [...prev, ...hyd]);
    setPendingItems([]); // Clear pending to prevent duplication
    toast.success(`${hyd.length} items staged`);
  };

  const handleImport = async (onSuccess?: () => void) => {
    if (!isAdmin) return toast.error("Admin only");
    if (!supplierName || !items.length) return toast.error("Supplier and items required");

    const toastId = toast.loading("Generating GRN Record...");
    try {
      // 1. Create the Purchase Invoice (GRN)
      const { data: grn, error: grnError } = await supabase
        .from("purchase_invoices")
        .insert({
          supplier_name: supplierName,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          total_amount: stats.totalInvoicedValue,
          status: "posted", // Change from "pending" to "posted" so it shows in history
          created_by: user?.id,
          total_freight: Number(totalFreight) || 0,
          total_handling: Number(totalHandling) || 0,
          notes: `GRN created by ${user?.email || 'unknown'}`
        })
        .select()
        .single();

      if (grnError) {
        console.error('[Context]', grnError);
        throw grnError;
      }

      // 2. Prepare line items for purchase_invoice_items
      const invoiceItems = items.map(item => ({
        purchase_invoice_id: grn.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_cost: item.unitCost,
        pack_type: item.packType,
        expiry_date: item.expiryDate || null,
        units_per_packet: item.unitsPerPacket,
        packets_per_case: item.packetsPerCase,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_invoice_items")
        .insert(invoiceItems);

      if (itemsError) {
        console.error('[Context]', itemsError);
        throw itemsError;
      }

      // 3. Prepare inventory batches for physical stock update
      const batchInserts = items.map(item => {
        const p = products.find(px => px.id === item.productId);
        const pricingProd: PricingProduct = {
          id: item.productId,
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
          mrp: p?.mrp || 0,
          weight_per_unit_grams: p?.weight_per_unit_grams || 0,
          pack_size_value: p?.pack_size_value || 0,
          pack_size_unit: p?.pack_size_unit || "g",
          unit_type: p?.unit_type as "pcs" | "packet" | "kg_g" | null
        };

        const invoicedCostPerPack = Number(item.unitCost) || 0;
        const packMult = getPackMultiplier(pricingProd, item.packType);
        const totalPcs = Number(item.quantity) * packMult;

        const allocation = getAllocationInfo({
          itemQty: Number(item.quantity) || 0,
          itemUnitCost: Number(item.unitCost) || 0,
          itemBaseUnits: totalPcs,
          itemWeightGrams: (p?.pack_size_value && p?.pack_size_unit?.toLowerCase().startsWith('g')) ? p.pack_size_value : (p?.pack_size_value || 0) * 1000,
          totalFreight: Number(totalFreight) || 0,
          totalHandling: Number(totalHandling) || 0,
          totalWeightKG: stats.totalWeight,
          totalInvoiceValue: stats.totalInvoicedValue,
          manifestLineCount: items.length
        });

        const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
        const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;

        const landedPerPack = invoicedCostPerPack + (freightForLine / (Number(item.quantity) || 1)) + (handlingForLine / (Number(item.quantity) || 1));
        const landedPerPcs = packMult > 0 ? landedPerPack / packMult : landedPerPack;

        return {
          product_id: item.productId,
          purchase_invoice_id: grn.id,
          received_qty: item.quantity, // Should be qty in pack_type or pcs? Usually batch Row has received_qty (line 122 of types.ts)
          remaining_qty: item.quantity,
          cost_price: item.unitCost, 
          landed_cost: landedPerPcs, // Use the correct column name from types.ts
          batch_number: `B-${item.sku}-${new Date().getTime() % 100000}`,
          expiry_date: item.expiryDate || null,
          received_at: new Date().toISOString(),
          received_by: user?.id,
        };
      });

      const { error: batchError } = await supabase.from("inventory_batches").insert(batchInserts);
      if (batchError) {
        console.error('[Context]', batchError);
        throw batchError;
      }

      toast.success("GRN finalized and stock updated", { id: toastId });
      setItems([]);
      setInvoiceNumber("");
      setSupplierName("");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    }
  };

  const addItem = (product: Product) => {
    const { basis } = detectLandedCostBasis(product as unknown as PricingProduct);
    
    const newItem: StockItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantity: 1,
      unitCost: product.mrp, 
      expiryDate: "",
      packedDate: globalPackedDate,
      packType: basis === 'kg' ? 'kg' : (product.preferred_sell_unit === "packet" ? "packet" : "unit"),
      unitsPerPacket: product.units_per_packet || 1,
      packets_per_case: product.packets_per_case || 1,
      pack_size_value: product.pack_size_value,
      pack_size_unit: product.pack_size_unit,
      mrp: product.mrp,
      unit_type: product.unit_type
    } as StockItem;
    
    if (globalPackedDate.length === 4) {
      const exp = mmyyToIsoExpiryDate(addMonthsMMYY(globalPackedDate, 12));
      if (exp) newItem.expiryDate = exp;
    }
    
    setItems(prev => [...prev, newItem]);
  };

  const updateItem = (id: string, field: keyof StockItem, value: unknown) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const updateAllPackedDate = (val: string) => {
    setGlobalPackedDate(val);
    if (val.length === 4) {
      const exp = mmyyToIsoExpiryDate(addMonthsMMYY(val, 12));
      setItems(prev => prev.map(it => ({ 
        ...it, 
        packedDate: val, 
        expiryDate: it.expiryDate || exp || "" 
      })));
    }
  };

  return {
    isAdmin,
    items,
    setItems,
    invoiceNumber,
    setInvoiceNumber,
    supplierName,
    setSupplierName,
    invoiceDate,
    setInvoiceDate,
    totalFreight,
    setTotalFreight,
    totalHandling,
    setTotalHandling,
    globalPackedDate,
    updateAllPackedDate,
    stats,
    parsing,
    handleFileUpload,
    onPasteExtract,
    confirmMapping,
    handleImport,
    addItem,
    updateItem,
    removeItem,
    pendingItems,
    isBulkImportOpen,
    setIsBulkImportOpen,
    bulkStep,
    setBulkStep
  };
}
