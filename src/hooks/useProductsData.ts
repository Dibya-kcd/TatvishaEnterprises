import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { useProductsCatalog } from "@/hooks/useProductsCatalog";
import { useQueryClient } from "@tanstack/react-query";
import { type Product } from "@/types";
import { useFilters } from "@/hooks/useFilters";

const ANY = "All";

const empty: Partial<Product> = {
  name: "", sku: "", mrp: 0, gst_rate: 0, hsn: "",
  min_stock: 10, is_active: true,
  units_per_packet: 1, packets_per_case: 1,
  item_pack_type: "pcs", division_category: "",
  unit_type: "pcs", weight_per_unit_grams: null,
  display_weight_unit: "g",
  brand: "", preferred_sell_unit: "packet",
  batch_number: "",
  case_qty_unit: "unit",
};

const computeWeightPerUnit = (value: number | null, unit: string | null): number | null => {
  if (!value || !unit) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gms' || u === 'ml') return value;
  if (u === 'kg' || u === 'ltr' || u === 'l') return value * 1000;
  return null;
};

const extractWeight = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(\.?gms?|g|kg|ml|ltr)/i);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    // Standardize all variations of weight units
    if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
    if (unit === 'kg') unit = 'Kg';
    return { value, unit };
  }
  return null;
};

export function useProductsData() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ category: ANY, initialFilters: { sort: 'Stock (High)' } });

  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState<Partial<Product>>(empty);
  const [inferred, setInferred] = React.useState<string | null>(null);
  const [productsActiveTab, setProductsActiveTab] = React.useState("details");
  const [showHealConfirm, setShowHealConfirm] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(true);

  const handleNameChange = (name: string) => {
    const weight = extractWeight(name);
    setEdit(prev => {
      const updates: Partial<Product> = { name };
      if (weight) {
        updates.pack_size_value = weight.value;
        updates.pack_size_unit = weight.unit;
        updates.case_qty_unit = "kg";
        if (!prev.preferred_sell_unit || prev.preferred_sell_unit === 'packet' || prev.preferred_sell_unit === 'unit') {
          updates.preferred_sell_unit = "kg";
        }
      }
      return { ...prev, ...updates };
    });
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch
  } = useProductsCatalog(debouncedSearch, state.category, showInactive);

  const allItems = React.useMemo(() => {
    const flat = data?.pages.flatMap(p => p.data) || [];
    const filtered = flat.filter(p => showInactive || p.is_active || (p.inventory?.quantity || 0) > 0);
    
    // Sort: Active AND In Stock first, then by the user's selected sort if applicable
    return [...filtered].sort((a, b) => {
      const aQty = a.inventory?.quantity || 0;
      const bQty = b.inventory?.quantity || 0;
      const aActive = a.is_active && aQty > 0;
      const bActive = b.is_active && bQty > 0;

      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }
      
      // Secondary sort: if both same "activeness", keep original sort or at least push 0 stock to bottom
      if (aQty === 0 && bQty > 0) return 1;
      if (aQty > 0 && bQty === 0) return -1;
      
      return 0;
    });
  }, [data, showInactive]);

  const [history, setHistory] = React.useState<Record<string, unknown[]>>({});
  const [loadingHistory, setLoadingHistory] = React.useState<Record<string, boolean>>({});

  const fetchHistory = async (productId: string) => {
    if (loadingHistory[productId]) return;
    setLoadingHistory(prev => ({ ...prev, [productId]: true }));
    try {
      const { data, error } = await supabase
        .from("product_price_history")
        .select(`
          *,
          profile:profiles!changed_by(full_name)
        `)
        .eq("product_id", productId)
        .order("changed_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setHistory(prev => ({ ...prev, [productId]: (data || []) as unknown[] }));
    } catch (err: unknown) {
      console.error("[Context] fetchHistory failed", err);
    } finally {
      setLoadingHistory(prev => ({ ...prev, [productId]: false }));
    }
  };

  const [healing, setHealing] = React.useState(false);
  const [healProgress, setHealProgress] = React.useState({ current: 0, total: 0 });

  const performHealData = async () => {
    if (!isAdmin || healing) return;

    setHealing(true);
    const toastId = toast.loading("Standardizing entire product database...");
    
    try {
      const { data: allItemsList, error: fetchError } = await supabase.from("products").select("*");
      if (fetchError) throw fetchError;
      if (!allItemsList) return;

      setHealProgress({ current: 0, total: allItemsList.length });
      let count = 0;
      let errorCount = 0;
      
      const standardize = (val: string | null, type: 'weight' | 'pack' = 'weight') => {
        if (!val) return val;
        const normalized = val.trim().toLowerCase();
        
        if (type === 'weight') {
          if (["g", "gms", ".gms", "g.", "gms.", "gm", "gram", "grams"].includes(normalized)) return "g";
          if (["kg", "kgs", "kg.", "kgs.", "kilogram", "kilograms"].includes(normalized)) return "Kg";
        } else {
          if (["packet", "pkt", "pkts", "pouch", "sachet", "pkg", "pkd"].includes(normalized)) return "packet";
          if (["unit", "pcs", "pc", "units"].includes(normalized)) return "pcs";
          if (["case", "ctn", "carton", "box", "bag"].includes(normalized)) return "case";
          if (["kg", "kgs"].includes(normalized)) return "kg";
        }
        return val;
      };

      for (let i = 0; i < allItemsList.length; i++) {
        const p = allItemsList[i];
        setHealProgress({ current: i + 1, total: allItemsList.length });
        
        const newPackUnit = standardize(p.pack_size_unit, 'weight');
        const newBaseWeightUnit = (newPackUnit === "g" || newPackUnit === "Kg") ? newPackUnit : null;
        const newCaseUnit = standardize(p.case_qty_unit, 'pack');
        const newPreferredUnit = standardize(p.preferred_sell_unit, 'pack');
        const newUnit = standardize(p.unit, 'pack');
        const newBaseUnit = standardize(p.base_unit, 'pack');

        let newPPC = p.packets_per_case;
        if (p.brand?.toLowerCase().includes("bharat") || p.name?.toLowerCase().includes("bharat")) {
          if (p.name?.includes("100 g") && (!newPPC || newPPC <= 1)) {
            newPPC = 18;
          } else if (p.name?.includes("50 g") && (!newPPC || newPPC <= 1)) {
            newPPC = 30;
          }
        }

        const calculatedUPC = (p.units_per_packet || 1) * (newPPC || 1);
        const currentUPC = p.units_per_case || 1;

        const updates: Partial<Product> = {};
        if (p.pack_size_unit !== newPackUnit) updates.pack_size_unit = newPackUnit;
        if (p.base_weight_unit !== newBaseWeightUnit) updates.base_weight_unit = newBaseWeightUnit;
        if (p.case_qty_unit !== newCaseUnit) updates.case_qty_unit = newCaseUnit;
        if (p.preferred_sell_unit !== newPreferredUnit) updates.preferred_sell_unit = newPreferredUnit;
        if (p.unit !== newUnit && newUnit) updates.unit = newUnit;
        if (p.base_unit !== newBaseUnit && newBaseUnit) updates.base_unit = newBaseUnit;
        if (p.packets_per_case !== newPPC) updates.packets_per_case = newPPC;

        if (currentUPC !== calculatedUPC && calculatedUPC > 1) {
          updates.units_per_case = calculatedUPC;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("products")
            .update(updates)
            .eq("id", p.id);
          
          if (!updateError) count++;
          else errorCount++;
        }
      }
      
      toast.success(`Succesfully standardized ${count} products${errorCount > 0 ? `. ${errorCount} errors occurred.` : ''}`, { id: toastId });
      refetch(); 
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setHealing(false);
      setHealProgress({ current: 0, total: 0 });
    }
  };

  const healData = () => {
    if (!isAdmin || healing) return;
    setShowHealConfirm(true);
  };

  const openEdit = (p: Product) => {
    setInferred(null);
    setProductsActiveTab("details");
    fetchHistory(p.id);
    setEdit({ ...p });
    setOpen(true);
  };

  const save = async () => {
    if (!edit.name?.trim() || !edit.sku?.trim()) return toast.error("Name and SKU required");

    try {
      const { data: existing, error: checkError } = await supabase
        .from("products")
        .select("id")
        .eq("sku", edit.sku.trim().toUpperCase())
        .neq("id", edit.id || "")
        .maybeSingle();
      
      if (checkError) {
        console.error('[Context] SKU check failed', checkError);
        return toast.error(friendlyError(checkError));
      }
      if (existing) return toast.error(`SKU "${edit.sku.toUpperCase()}" already exists`);
    } catch (err) {
       console.error('[Context] SKU check caught error', err);
       return toast.error(friendlyError(err));
    }
    
    const normalize = (val: string | null | undefined): "pcs" | "packet" | "case" | "kg" => {
      if (!val) return "pcs";
      const v = val.toLowerCase();
      if (v === "case" || v === "ctn" || v === "carton" || v === "box" || v === "bag") return "case";
      if (v === "packet" || v === "pouch" || v === "sachet" || v === "pkt" || v === "pkg" || v === "pack") return "packet";
      if (v === "kg") return "kg";
      return "pcs";
    };

    const normType = normalize(edit.unit_type);
    if (normType !== 'pcs' && normType !== 'kg') {
      if (Number(edit.units_per_packet || 0) <= 1 && Number(edit.packets_per_case || 0) <= 1) {
        return toast.error("Configuration Required", {
          description: "For non-unit products, you must specify units per packet or packets per case to ensure correct stock deduction."
        });
      }
    }

    const weightUnit = (edit.pack_size_unit || "").toLowerCase();
    let standardizedPackUnit = edit.pack_size_unit || null;
    if (weightUnit === "g" || weightUnit === "gms" || weightUnit === ".gms") standardizedPackUnit = "g";
    if (weightUnit === "kg" || weightUnit === "kgs") standardizedPackUnit = "Kg";
    
    const baseWeightUnit = (standardizedPackUnit === "g" || standardizedPackUnit === "Kg") ? standardizedPackUnit : null;

    const payload = {
      name: edit.name!.trim(), 
      sku: edit.sku!.trim().toUpperCase(),
      mrp: Number(edit.mrp || 0),
      gst_rate: Number(edit.gst_rate || 0),
      hsn: edit.hsn || null, 
      min_stock: Number(edit.min_stock || 0),
      is_active: edit.is_active ?? true,
      units_per_packet: Number(edit.units_per_packet || 1),
      packets_per_case: Number(edit.packets_per_case || 1),
      units_per_case: Number(edit.unit_type === 'pcs' ? (edit.units_per_case || 1) : (edit.units_per_packet || 1) * (edit.packets_per_case || 1)),
      item_pack_type: normalize(edit.item_pack_type),
      division_category: edit.division_category || null,
      division: edit.division || null,
      preferred_sell_unit: edit.is_chain_item ? "pcs" : normalize(edit.preferred_sell_unit || (edit.unit_type === 'kg_g' ? 'kg' : 'packet')),
      is_chain_item: edit.is_chain_item ?? false,
      is_mrp_priced: edit.is_mrp_priced ?? edit.is_chain_item ?? false,
      chain_mrp_label: edit.chain_mrp_label || null,
      brand: edit.brand || null,
      batch_number: edit.batch_number || null,
      pack_size_value: edit.pack_size_value != null ? Number(edit.pack_size_value) : null,
      pack_size_unit: standardizedPackUnit,
      base_weight_unit: baseWeightUnit,
      case_qty_unit: edit.case_qty_unit || "unit",
      unit: edit.unit || (edit.item_pack_type && !["unit", "packet", "case"].includes(edit.item_pack_type) ? edit.item_pack_type : null),
      base_unit: edit.unit || (edit.item_pack_type && !["unit", "packet", "case"].includes(edit.item_pack_type) ? edit.item_pack_type : null),
      unit_type: edit.unit_type || "pcs",
      weight_per_unit_grams: computeWeightPerUnit(edit.pack_size_value || null, edit.pack_size_unit || null),
      display_weight_unit: (edit.display_weight_unit as Product["display_weight_unit"]) || null,
    };
    
    const { error } = edit.id
      ? await supabase.from("products").update(payload).eq("id", edit.id)
      : await supabase.from("products").insert(payload);
    
    if (error) {
      console.error('[Context] save product failed', error);
      return toast.error(friendlyError(error));
    }
    toast.success(edit.id ? "Product updated" : "Product saved");
    setOpen(false); 
    refetch();
  };

  const [stats, setStats] = React.useState({ active: 0, total: 0, lowStock: 0, outOfStock: 0 });
  const [categoryCounts, setCategoryCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    async function fetchStats() {
      // Basic stats
      const qTotal = supabase.from("v_product_stock").select("id", { count: 'exact', head: true });
      const qActive = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("is_active", true).gt("stock_base_units", 0);
      const qLow = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("is_active", true).lte("stock_base_units", 10).gt("stock_base_units", 0);
      const qOut = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("stock_base_units", 0);

      // Category counts
      const qCats = supabase.rpc('get_product_category_counts');

      try {
        const [rTotal, rActive, rLow, rOut, rCats] = await Promise.all([
          qTotal, qActive, qLow, qOut, qCats
        ]);
        
        setStats({
          total: rTotal.count || 0,
          active: rActive.count || 0,
          lowStock: rLow.count || 0,
          outOfStock: rOut.count || 0,
        });

        if (rCats.data) {
          const counts: Record<string, number> = {};
          (rCats.data as { division_category: string | null; count: number }[]).forEach(row => {
            counts[row.division_category || "General"] = row.count;
          });
          setCategoryCounts(counts);
        }
      } catch (err) {
        console.error("Stats fetch failed", err);
      }
    }
    fetchStats();
  }, []);

  const categories = React.useMemo(() => {
    const list = Object.entries(categoryCounts)
      .map(([label, count]) => ({ label, count }));
    
    const sortedList = list.sort((a, b) => a.label.localeCompare(b.label));
    const totalCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    
    return [
      { label: ANY, count: totalCount },
      ...sortedList
    ];
  }, [categoryCounts]);

  return {
    isAdmin,
    state,
    setSearch,
    setCategory,
    setFilter,
    clearFilters,
    open,
    setOpen,
    edit,
    setEdit,
    inferred,
    productsActiveTab,
    setProductsActiveTab,
    showHealConfirm,
    setShowHealConfirm,
    showInactive,
    setShowInactive,
    allItems,
    stats,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    history,
    healing,
    healProgress,
    performHealData,
    healData,
    openEdit,
    save,
    categories,
    empty,
    handleNameChange
  };
}
