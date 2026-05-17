import * as React from "react";
import { type Product } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Trash2, X, Check, Package, BarChart3, Settings2, Truck, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtINR } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

interface ProductDrawerProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const extractWeight = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(\.?gms?|g|kg|ml|ltr)/i);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
    if (unit === 'kg') unit = 'Kg';
    return { value, unit };
  }
  return null;
};

const computeWeightPerUnit = (value: number | null, unit: string | null): number | null => {
  if (!value || !unit) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gms' || u === 'ml') return value;
  if (u === 'kg' || u === 'ltr' || u === 'l') return value * 1000;
  return null;
};

export const ProductDrawer = ({ productId, open, onOpenChange, onSaved }: ProductDrawerProps) => {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState<Partial<Product>>({});
  const [original, setOriginal] = React.useState<Product | null>(null);
  const [divisions, setDivisions] = React.useState<string[]>([]);
  const [stockStats, setStockStats] = React.useState({ global: 0, min: 0, batches: 0 });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: divData } = await supabase.from("products").select("division_category");
      const uniqueDivs = Array.from(new Set(divData?.map(d => d.division_category).filter(Boolean) as string[])).sort();
      setDivisions(uniqueDivs);

      if (productId === "new" || !productId || productId.startsWith("clone:")) {
        const sourceId = productId?.startsWith("clone:") ? productId.split(":")[1] : null;
        
        let initialData: Partial<Product> = {
          name: "",
          sku: "",
          mrp: 0,
          gst_rate: 0,
          is_active: true,
          unit_type: "pcs",
          units_per_packet: 1,
          packets_per_case: 1,
          units_per_case: 1,
          preferred_sell_unit: "packet",
          case_qty_unit: "unit",
          item_pack_type: "packet",
          brand: "TE",
          min_stock: 50,
        };

        if (sourceId) {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", sourceId)
            .single();
          
          if (data && !error) {
            // Take everything except identifying fields
            const { id: _id, created_at: _ca, sku: _sku, ...rest } = data;
            initialData = { 
              ...rest, 
              name: `${data.name} (Copy)`,
              sku: `${data.sku}-COPY`
            } as Partial<Product>;
          }
        }
        
        setEdit(initialData);
        setStockStats({ global: 0, min: initialData.min_stock || 50, batches: 0 });
      } else {
        const { data, error } = await supabase
          .from("v_product_stock")
          .select("*")
          .eq("id", productId)
          .single();
        
        if (error) throw error;
        
        const { data: batchData } = await supabase
          .from("inventory_batches")
          .select("id, remaining_qty")
          .eq("product_id", productId)
          .gt("remaining_qty", 0);

        const globalStock = batchData?.reduce((sum, b) => sum + (Number(b.remaining_qty) || 0), 0) || 0;
        
        setEdit(data as Product);
        setOriginal(data as Product);
        setStockStats({ 
          global: globalStock, 
          min: data.min_stock || 0, 
          batches: batchData?.length || 0 
        });
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  React.useEffect(() => {
    if (open) {
      load();
    } else {
      setEdit({});
      setOriginal(null);
    }
  }, [open, load]);

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

  const save = async () => {
    if (!edit.name?.trim() || !edit.sku?.trim()) return toast.error("Name and SKU required");
    setBusy(true);

    try {
      const normalize = (val: string | null | undefined): "pcs" | "packet" | "case" | "kg" => {
        if (!val) return "pcs";
        const v = val.toLowerCase();
        if (v === "case" || v === "ctn" || v === "carton" || v === "box" || v === "bag") return "case";
        if (v === "packet" || v === "pouch" || v === "sachet" || v === "pkt" || v === "pkg" || v === "pack") return "packet";
        if (v === "kg") return "kg";
        return "pcs";
      };

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
        brand: edit.brand || null,
        pack_size_value: edit.pack_size_value != null ? Number(edit.pack_size_value) : null,
        pack_size_unit: standardizedPackUnit,
        base_weight_unit: baseWeightUnit,
        case_qty_unit: edit.case_qty_unit || "unit",
        unit_type: edit.unit_type || "pcs",
        weight_per_unit_grams: computeWeightPerUnit(edit.pack_size_value || null, edit.pack_size_unit || null),
        display_weight_unit: edit.display_weight_unit || null,
      };

      const isNew = !productId || productId === "new" || productId.startsWith("clone:");

      if (isNew) {
        // Check for duplicate SKU
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("sku", payload.sku)
          .maybeSingle();

        if (existing) {
          toast.error("SKU already exists", { description: "Each product must have a unique identifiers (SKU)." });
          setBusy(false);
          return;
        }

        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Product created");
      } else {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
        toast.success("Product updated");
      }
      
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-slate-50/30 overflow-hidden">
        <SheetHeader className="p-6 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-xl font-black text-slate-900 tracking-tight">
                {productId === "new" ? "New item" : productId?.startsWith("clone:") ? "Clone product" : "Edit product"}
              </SheetTitle>
              {edit.sku && (
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">
                  {edit.sku}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-slate-400" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Global stock</span>
              <span className="text-lg font-black text-emerald-600 tabular-nums">{stockStats.global}</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Min stock</span>
              <span className="text-lg font-black text-slate-900 tabular-nums">{stockStats.min}</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Active batches</span>
              <span className="text-lg font-black text-slate-900 tabular-nums">{stockStats.batches}</span>
            </div>
          </div>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="bg-slate-100/50 p-1 rounded-xl h-12 w-full max-w-[300px] mb-6">
              <TabsTrigger value="details" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900">Details</TabsTrigger>
              <TabsTrigger value="logistics" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900">Shipping</TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-8">
              {/* Basic Info Section */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 ml-1">Product name</Label>
                  <Input 
                    className="h-12 rounded-xl bg-white border-slate-200 font-bold px-4 shadow-sm focus:border-primary/20"
                    placeholder="e.g. Black Salt - 100g Pack"
                    value={edit.name || ""}
                    onChange={e => handleNameChange(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">SKU <span className="text-[10px] text-slate-400">(locked)</span></Label>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 font-black uppercase px-4 shadow-sm text-slate-500"
                      value={edit.sku || ""}
                      disabled={!!original?.id}
                      onChange={e => setEdit({...edit, sku: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">HSN (Tax Code)</Label>
                    <Input 
                      className="h-12 rounded-xl bg-white border-slate-200 font-bold px-4 shadow-sm"
                      placeholder="e.g. 0910"
                      value={edit.hsn || ""}
                      onChange={e => setEdit({...edit, hsn: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">Brand</Label>
                    <Input 
                      className="h-12 rounded-xl bg-white border-slate-200 font-bold px-4 shadow-sm"
                      placeholder="e.g. TE"
                      value={edit.brand || ""}
                      onChange={e => setEdit({...edit, brand: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">Category</Label>
                    <Select value={edit.division_category || ""} onValueChange={v => setEdit({...edit, division_category: v})}>
                      <SelectTrigger className="h-12 rounded-xl bg-white border-slate-200 font-bold px-4 shadow-sm">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 shadow-2xl">
                        {divisions.map(d => (
                          <SelectItem key={d} value={d} className="font-bold">{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Pricing Section */}
              <div className="space-y-4 pt-4">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-100 pb-2 mb-4">Pricing</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">MRP (₹)</Label>
                    <Input 
                      type="number"
                      className="h-12 rounded-xl bg-white border-slate-200 font-black text-slate-900 px-4 shadow-sm"
                      value={edit.mrp || 0}
                      onChange={e => setEdit({...edit, mrp: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1 truncate">Landed cost (₹)</Label>
                    <Input 
                      type="number"
                      className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold text-slate-400 px-4 shadow-sm"
                      value={original?.inventory?.avg_landed_cost || 0}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">Stock alert at</Label>
                    <Input 
                      type="number"
                      className="h-12 rounded-xl bg-white border-slate-200 font-bold text-slate-900 px-4 shadow-sm"
                      value={edit.min_stock || 0}
                      onChange={e => setEdit({...edit, min_stock: Number(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <div className="space-y-4 pt-4">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-100 pb-2 mb-4">Settings</h3>
                <div className="flex flex-wrap gap-4">
                   <div className={cn(
                     "flex items-center gap-3 px-6 h-12 rounded-xl border transition-all cursor-pointer select-none",
                     edit.is_active ? "bg-white border-primary/20 text-slate-900 shadow-sm" : "bg-slate-50 border-slate-100 text-slate-400"
                   )} onClick={() => setEdit({...edit, is_active: !edit.is_active})}>
                     {edit.is_active ? <Check className="h-4 w-4 text-emerald-500" /> : <div className="h-4 w-4" />}
                     <span className="text-xs font-bold uppercase tracking-widest">Active</span>
                   </div>

                   <div className={cn(
                     "flex items-center gap-3 px-6 h-12 rounded-xl border transition-all cursor-pointer select-none",
                     edit.is_chain_item ? "bg-white border-primary/20 text-slate-900 shadow-sm" : "bg-slate-50 border-slate-100 text-slate-400"
                   )} onClick={() => setEdit({...edit, is_chain_item: !edit.is_chain_item})}>
                     {edit.is_chain_item ? <Check className="h-4 w-4 text-emerald-500" /> : <div className="h-4 w-4" />}
                     <span className="text-xs font-bold uppercase tracking-widest hover:text-slate-900">Chain item</span>
                   </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logistics" className="space-y-8">
               <div className="bg-white border border-slate-100 rounded-[2rem] p-8 space-y-8 shadow-sm">
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                       <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Packaging Hierarchy</Label>
                       <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                             <Label className="text-xs font-bold text-slate-500 ml-1">Units per Packet</Label>
                             <Input 
                              type="number"
                              className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold px-4"
                              value={edit.units_per_packet || 1}
                              onChange={e => setEdit({...edit, units_per_packet: Number(e.target.value)})}
                             />
                          </div>
                          <div className="space-y-2">
                             <Label className="text-xs font-bold text-slate-500 ml-1">Packets per Case</Label>
                             <Input 
                              type="number"
                              className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold px-4"
                              value={edit.packets_per_case || 1}
                              onChange={e => setEdit({...edit, packets_per_case: Number(e.target.value)})}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Storage Info</Label>
                       <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                             <Label className="text-xs font-bold text-slate-500 ml-1">HSN code</Label>
                             <Input 
                              className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold px-4"
                              value={edit.hsn || ""}
                              onChange={e => setEdit({...edit, hsn: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <Label className="text-xs font-bold text-slate-500 ml-1">Batch number</Label>
                             <Input 
                              className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold px-4"
                              value={edit.batch_number || ""}
                              onChange={e => setEdit({...edit, batch_number: e.target.value})}
                             />
                          </div>
                       </div>
                    </div>
                 </div>
               </div>
            </TabsContent>
            
            <TabsContent value="history" className="space-y-4">
               {productId === "new" ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-30 gap-4">
                    <History className="h-12 w-12" />
                    <p className="text-xs font-black uppercase tracking-widest">No history for new items</p>
                 </div>
               ) : (
                 <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    {/* Simplified history view */}
                    <div className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest bg-slate-50/50 border-b border-slate-100">Price & Detail Changes</div>
                    <div className="p-4 flex flex-col gap-4">
                       <p className="text-xs text-slate-500 italic">Audit log feature coming soon to this drawer view...</p>
                    </div>
                 </div>
               )}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="p-6 bg-white border-t border-slate-100 shrink-0 gap-3">
          <Button 
            variant="outline" 
            className="flex-1 h-12 rounded-xl font-bold text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => onOpenChange(false)}
          >
            Discard
          </Button>
          <Button 
            className="flex-[2] h-12 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-white"
            onClick={save}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
