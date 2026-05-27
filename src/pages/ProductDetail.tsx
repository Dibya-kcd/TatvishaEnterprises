import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, Package, Zap, History, Minus, Plus, 
  Check, Loader2, Save, Trash2, ShieldCheck, 
  Settings2, Activity, Truck, Grid, TrendingUp, TrendingDown,
  Info, BarChart3, PhilippinePeso
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { type Product } from "@/types";
import { fmtDate, fmtINR } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer as RechartsContainer,
  AreaChart,
  Area
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PHYSICAL_PACK_TYPES = [
  { id: "pcs", label: "Pieces", icon: "P" },
  { id: "packet", label: "Packet", icon: "P" },
  { id: "case", label: "Case", icon: "C" },
  { id: "jar", label: "Jar", icon: "J" },
  { id: "bottle", label: "Bottle", icon: "B" },
  { id: "tin", label: "Tin", icon: "T" },
  { id: "box", label: "Box", icon: "X" },
];

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

interface HistoryLog {
  id: string;
  field_changed: string;
  old_value: string | number | null;
  new_value: string | number | null;
  changed_at: string;
  profile?: { full_name: string | null } | null;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [product, setProduct] = React.useState<Product | null>(null);
  const [edit, setEdit] = React.useState<Partial<Product>>({});
  const [history, setHistory] = React.useState<HistoryLog[]>([]);
  const [activeTab, setActiveTab] = React.useState("details");
  const [divisions, setDivisions] = React.useState<string[]>([]);
  const { categoryMargins } = useGlobalSettings();

  const wacHistoryData = React.useMemo(() => {
    // Filter history for avg_landed_cost changes
    return history
      .filter(h => h.field_changed === 'avg_landed_cost' || h.field_changed === 'landed_cost')
      .map(h => ({
        date: new Date(h.changed_at).toLocaleDateString(),
        value: Number(h.new_value)
      }))
      .reverse(); // Chronological
  }, [history]);

  const load = React.useCallback(async () => {
    try {
      // Fetch divisions for select
      const { data: divData } = await supabase.from("products").select("division_category");
      const uniqueDivs = Array.from(new Set(divData?.map(d => d.division_category).filter(Boolean) as string[])).sort();
      setDivisions(uniqueDivs);

      if (!id || id === "new") {
        const defaultProd: Product = {
          id: "",
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
          item_pack_type: "packet"
        };
        setProduct(defaultProd);
        setEdit(defaultProd);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("v_product_stock")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) throw error;

      // Fetch actual total stock across all warehouses/batches
      const { data: batchData } = await supabase
        .from("inventory_batches")
        .select("remaining_qty")
        .eq("product_id", id);
      
      const realTotalStock = batchData?.reduce((sum, b) => sum + (Number(b.remaining_qty) || 0), 0) || 0;

      const fullData = { 
        ...(data as Record<string, unknown>), 
        inventory_quantity: realTotalStock 
      };

      setProduct(fullData as unknown as Product);
      setEdit(fullData as unknown as Product);

      // Fetch history
      const { data: hist } = await supabase
        .from("product_price_history")
        .select(`
          *,
          profile:profiles!changed_by(full_name)
        `)
        .eq("product_id", id)
        .order("changed_at", { ascending: false })
        .limit(20);
      
      setHistory((hist as unknown as HistoryLog[]) || []);

    } catch (err: unknown) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

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

      const normType = normalize(edit.unit_type);
      if (normType !== 'pcs' && normType !== 'kg') {
        if (Number(edit.units_per_packet || 0) <= 1 && Number(edit.packets_per_case || 0) <= 1) {
          setBusy(false);
          return toast.error("Configuration Required", {
            description: "For non-unit products, you must specify units per packet or packets per case."
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
        brand: edit.brand || null,
        pack_size_value: edit.pack_size_value != null ? Number(edit.pack_size_value) : null,
        pack_size_unit: standardizedPackUnit,
        base_weight_unit: baseWeightUnit,
        case_qty_unit: edit.case_qty_unit || "unit",
        unit_type: edit.unit_type || "pcs",
        weight_per_unit_grams: computeWeightPerUnit(edit.pack_size_value || null, edit.pack_size_unit || null),
        display_weight_unit: edit.display_weight_unit || null,
      };

      if (id === "new") {
        const { data: inserted, error: insertError } = await supabase.from("products").insert(payload).select().single();
        if (insertError) throw insertError;
        toast.success("Product created successfully");
        navigate(`/products/${inserted.id}`, { replace: true });
      } else {
        const { error: updateError } = await supabase.from("products").update(payload).eq("id", id!);
        if (updateError) throw updateError;
        toast.success("Product updated successfully");
        load();
      }
    } catch (err: unknown) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-[80vh]">
      <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
    </div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
      <Package className="h-16 w-16 text-slate-200" />
      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Product Not Found</p>
      <Button variant="outline" onClick={() => navigate("/products")}>Return to Catalog</Button>
    </div>
  );

  const inventoryStock = (product as unknown as { inventory_quantity: number }).inventory_quantity || 0;

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
      {/* Sticky Top Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")} className="h-10 w-10 rounded-xl hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Button>
          <div className="h-px w-6 bg-slate-200 hidden xs:block" />
          <div className="flex flex-col leading-tight">
            <h1 className="text-sm font-bold text-slate-900">
              {edit.name || (id === "new" ? "New Product" : "Untitled")}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{edit.sku || "PROTOCOL-GENESIS"}</span>
              {edit.is_active ? 
                <Badge className="h-4 px-1.5 text-[8px] bg-emerald-50 text-emerald-600 border-emerald-100 shadow-none">Active</Badge> : 
                <Badge className="h-4 px-1.5 text-[8px] bg-slate-100 text-slate-400 border-none shadow-none">Disabled</Badge>
              }
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline"
            onClick={save}
            disabled={busy}
            className="h-10 px-6 rounded-xl bg-white border-slate-200 text-slate-900 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            {busy ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5 text-brand-primary" />}
            Save
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Main Configuration */}
          <div className="lg:col-span-8 space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6">
                <Button 
                  variant={activeTab === "details" ? "default" : "outline"} 
                  onClick={() => setActiveTab("details")}
                  className={cn("h-10 rounded-xl font-bold text-xs uppercase tracking-widest", activeTab !== "details" && "border-slate-200 text-slate-500")}
                >
                  General Details
                </Button>
                <Button 
                  variant={activeTab === "valuation" ? "default" : "outline"} 
                  onClick={() => setActiveTab("valuation")}
                  className={cn("h-10 rounded-xl font-bold text-xs uppercase tracking-widest", activeTab !== "valuation" && "border-slate-200 text-slate-500")}
                >
                  Inventory Valuation
                </Button>
              </div>

              <TabsContent value="details" className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD]">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Core Identity</p>
                  </div>
                  <div className="p-8 space-y-8">
                    <div className="space-y-4">
                      <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Trade Title</Label>
                      <Input 
                        className="h-16 rounded-2xl border-slate-200 bg-white font-bold text-xl px-6 shadow-none focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/5 transition-all" 
                        value={edit.name ?? ""} 
                        placeholder="Enter trading title..."
                        onChange={e => handleNameChange(e.target.value)} 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">SKU identifier</Label>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50/50 font-extrabold uppercase text-slate-900 shadow-sm disabled:opacity-100" 
                          value={edit.sku ?? ""} 
                          placeholder="SKU-CODE"
                          disabled={!!product.id}
                          onChange={(e) => setEdit(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                        />
                      </div>
                      <div className="space-y-4">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">HSN classification</Label>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold px-6 shadow-sm" 
                          value={edit.hsn ?? ""} 
                          placeholder="0000"
                          onChange={e => setEdit({...edit, hsn: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Parent Brand</Label>
                        <Input className="h-14 rounded-2xl border-slate-200 bg-white font-bold px-6 shadow-sm" value={edit.brand ?? ""} placeholder="Tatvisha Enterprises" onChange={e => setEdit({...edit, brand: e.target.value})} />
                      </div>
                      <div className="space-y-4">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Product Category</Label>
                        <Select value={edit.division_category || ""} onValueChange={v => setEdit({...edit, division_category: v})}>
                          <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                            <SelectValue placeholder="Select vertical..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                            {divisions.map(d => (
                              <SelectItem key={d} value={d} className="font-bold">{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FEFCE8]/40">
                     <div className="flex items-center gap-3">
                        <Truck className="h-4 w-4 text-yellow-600" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-800/80 leading-none">Logistics & Master Data</p>
                     </div>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-6">
                         <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100/50 space-y-4">
                            <Label className="text-[10px] font-black uppercase text-amber-800/60 tracking-wider">Storage units</Label>
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-amber-600/60 uppercase ml-1">Units / Pkt</span>
                                  <Input 
                                    type="number" 
                                    className="h-12 border-amber-100 bg-white font-black text-lg rounded-xl px-4 shadow-sm" 
                                    value={edit.units_per_packet ?? 1} 
                                    onChange={e => setEdit({...edit, units_per_packet: Number(e.target.value)})} 
                                  />
                               </div>
                               <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-amber-600/60 uppercase ml-1">Pkts / Case</span>
                                  <Input 
                                    type="number" 
                                    className="h-12 border-amber-100 bg-white font-black text-lg rounded-xl px-4 shadow-sm" 
                                    value={edit.packets_per_case ?? 1} 
                                    onChange={e => setEdit({...edit, packets_per_case: Number(e.target.value)})} 
                                  />
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-4">
                          <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Base unit of measure</Label>
                          <Select value={edit.unit_type || "pcs"} onValueChange={v => setEdit({...edit, unit_type: v})}>
                            <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                              <SelectItem value="pcs" className="font-bold">Pieces / General</SelectItem>
                              <SelectItem value="kg" className="font-bold">Weighted (Kg/g)</SelectItem>
                              <SelectItem value="ltr" className="font-bold">Liquid (L/ml)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-tight">Active Status</span>
                            <span className="text-xs font-bold text-slate-600 mt-1">Visible in catalogs</span>
                          </div>
                          <Switch 
                            checked={edit.is_active ?? true} 
                            onCheckedChange={checked => setEdit({...edit, is_active: checked})} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="valuation" className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Valuation</p>
                         <h3 className="text-lg font-black text-slate-900 mt-1">Weighted Average Cost</h3>
                       </div>
                       <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                         <PhilippinePeso size={20} />
                       </div>
                    </div>
                    <CardContent className="p-8 space-y-8">
                       <div className="flex items-baseline gap-2">
                         <span className="text-4xl font-black text-slate-900 tabular-nums">{fmtINR(product.avg_landed_cost || 0)}</span>
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">/ unit</span>
                       </div>
                       
                       <div className="pt-6 border-t border-slate-100 space-y-4">
                         <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-500">Target Margin ({edit.division_category || 'N/A'})</span>
                           <Badge className="bg-brand-primary/10 text-brand-primary border-none font-black">{categoryMargins[edit.division_category || ""] || 0}%</Badge>
                         </div>
                         
                         {(() => {
                            const wac = product.avg_landed_cost || 0;
                            const targetMgn = categoryMargins[edit.division_category || ""] || 0;
                            const suggested = wac / (1 - (targetMgn / 100));
                            const currentPrice = edit.mrp || 0;
                            const actualMargin = currentPrice > 0 ? ((currentPrice - wac) / currentPrice) * 100 : 0;
                            
                            return (
                              <div className="space-y-4">
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                   <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Suggested Selling Price</p>
                                   <div className="flex items-center justify-between">
                                      <span className="text-xl font-black text-slate-900">{fmtINR(suggested)}</span>
                                      {suggested > currentPrice && (
                                        <div className="flex items-center gap-1.5 text-rose-500">
                                          <TrendingUp size={14} className="animate-pulse" />
                                          <span className="text-[10px] font-black uppercase">+Adjust Required</span>
                                        </div>
                                      )}
                                   </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 rounded-2xl border border-slate-100">
                                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Realized Margin</p>
                                     <p className={cn("text-lg font-black mt-1", actualMargin >= targetMgn ? "text-emerald-600" : "text-rose-600")}>
                                       {actualMargin.toFixed(1)}%
                                     </p>
                                  </div>
                                  <div className="p-4 rounded-2xl border border-slate-100">
                                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pricing Gap</p>
                                     <p className="text-lg font-black text-slate-900 mt-1">
                                       {fmtINR(currentPrice - suggested)}
                                     </p>
                                  </div>
                                </div>
                              </div>
                            );
                         })()}
                       </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valuation Trend</p>
                         <h3 className="text-lg font-black text-slate-900 mt-1">Cost Trajectory</h3>
                       </div>
                       <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                         <BarChart3 size={20} />
                       </div>
                    </div>
                    <CardContent className="p-6 flex-1 flex flex-col">
                       {wacHistoryData.length > 1 ? (
                         <div className="h-[240px] w-full mt-4">
                            <RechartsContainer width="100%" height="100%">
                              <AreaChart data={wacHistoryData}>
                                <defs>
                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ff6b00" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#ff6b00" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}} 
                                  dy={10}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}}
                                  tickFormatter={(v) => `₹${v}`}
                                />
                                <Tooltip 
                                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold'}}
                                  formatter={(v: number) => [fmtINR(v), 'Cost']}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="#ff6b00" 
                                  strokeWidth={3} 
                                  fillOpacity={1} 
                                  fill="url(#colorValue)" 
                                />
                              </AreaChart>
                            </RechartsContainer>
                         </div>
                       ) : (
                         <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                           <Activity className="h-12 w-12 text-slate-200 mb-4" />
                           <p className="text-xs font-black uppercase tracking-widest text-slate-400">Not enough history</p>
                           <p className="text-[10px] font-bold text-slate-300 mt-2">Historical WAC trends will appear as batches are received.</p>
                         </div>
                       )}
                       
                       <div className="mt-auto p-4 rounded-2xl bg-blue-50/50 border border-blue-100/50 flex gap-4">
                          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] font-medium text-blue-700 leading-relaxed uppercase tracking-tight">
                            Trend shows the weighted average cost evolution over the last 20 receiving events. 
                            Rising trends indicate supply chain inflation.
                          </p>
                       </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT COLUMN: Stats & Secondary Actions */}
          <div className="lg:col-span-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Real-time Inventory Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-xl shadow-slate-200/40">
              <div className="p-6 bg-slate-900 text-white">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Grid size={16} className="text-brand-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Global Stock</span>
                  </div>
                  <Badge className="bg-white/10 text-brand-primary border-none text-[10px] font-black">LIVE</Badge>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                   <h3 className="text-4xl font-black tabular-nums">{inventoryStock.toLocaleString()}</h3>
                   <span className="text-xs font-bold opacity-40 uppercase tracking-widest">{edit.unit_type === 'pcs' ? 'units' : (edit.unit_type || 'units')}</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                   <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: `${Math.min(100, (inventoryStock / (edit.min_stock || 100)) * 100)}%` }}
                     className={cn(
                       "h-full rounded-full transition-all duration-1000",
                       inventoryStock <= (edit.min_stock || 0) ? "bg-rose-500" : "bg-emerald-500"
                     )}
                   />
                </div>
                <div className="flex items-center justify-between mt-3">
                   <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Min trigger: {edit.min_stock || 0}</span>
                   {inventoryStock <= (edit.min_stock || 0) && (
                     <span className="text-[10px] font-bold text-rose-400 animate-pulse">CRITICAL LOW</span>
                   )}
                </div>
              </div>
            </Card>

            {/* Pricing Summary Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
               <div className="p-6 border-b border-slate-100">
                 <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Pricing Benchmarks</p>
               </div>
               <div className="p-6 space-y-6">
                 <div>
                   <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Retail MRP (Standard)</Label>
                   <p className="text-2xl font-black text-slate-900 mt-1">{fmtINR(edit.mrp || 0)}</p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">GST Rate</span>
                      <p className="text-sm font-black text-slate-900">{edit.gst_rate ?? 0}%</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Input Tax</span>
                      <p className="text-sm font-black text-emerald-600">Included</p>
                    </div>
                 </div>

                 <Button 
                    variant="outline" 
                    className="w-full h-12 rounded-xl border-slate-100 font-bold text-xs gap-2 text-slate-600 hover:bg-slate-50 hover:text-brand-primary transition-all"
                    onClick={() => navigate('/products/price-tiers')}
                  >
                   <Settings2 size={16} />
                   Configure Tiers
                 </Button>
               </div>
            </Card>

            {/* Change History Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
               <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                 <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Activity Log</p>
                 <History size={14} className="text-slate-300" />
               </div>
               <div className="p-6 max-h-[300px] overflow-y-auto no-scrollbar">
                  {history.length === 0 ? (
                    <div className="text-center py-8">
                       <p className="text-[10px] font-bold text-slate-300 uppercase italic">No recent activity</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       {history.map((h, i) => (
                         <div key={h.id} className="relative pl-6 pb-2 last:pb-0">
                            {i !== history.length - 1 && <div className="absolute left-[3px] top-4 bottom-0 w-[2px] bg-slate-100" />}
                            <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-brand-primary ring-4 ring-white" />
                            <div className="flex flex-col gap-1">
                               <p className="text-[11px] font-bold text-slate-800 leading-tight">
                                  {h.field_changed.replace('_', ' ')} <span className="text-slate-400 font-normal">updated to</span> {String(h.new_value)}
                               </p>
                               <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-medium text-slate-400 uppercase">{fmtDate(h.changed_at)}</span>
                                  <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{h.profile?.full_name?.split(' ')[0] || 'SYSTEM'}</span>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
