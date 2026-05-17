import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Edit2, Plus, Search, AlertTriangle, Trash2, PackagePlus, FileUp, Zap, 
  Loader2, History as HistoryIcon, FileText, ArrowRightLeft, Settings2, 
  IndianRupee as IndianRupeeIcon, Warehouse, ClipboardList, TrendingUp, 
  Download, Receipt, Sparkles, LucideIcon, Layers, ChevronRight, MoreVertical 
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtDate, fmtINR } from "@/lib/format";
import { derivePackaging, formatStockBreakdown, getAvailableSellUnits, convertToBaseUnits, getDetailedStockBreakdown } from "@/lib/packaging";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { cn } from "@/lib/utils";
import { Product as GlobalProduct, Warehouse as WarehouseType } from "@/types";
import { autoCalcAllTiers, PricingProduct } from "@/lib/pricing";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { useFilters } from "@/hooks/useFilters";
import { PageHeader } from "@/components/PageHeader";
import { useInventory } from "@/hooks/useInventory";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ResponsiveContainer, 
  AdaptiveTable,
} from "@/components/ui/responsive-ui";
import { ListCard } from "@/components/ListCard";

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string;
  received_qty: number;
  remaining_qty: number;
  cost_price: number;
  landed_cost: number | null;
  freight_cost_per_unit?: number;
  handling_cost_per_unit?: number;
  notes: string | null;
  received_at: string;
  product?: GlobalProduct | null;
  warehouse_id: string | null;
  warehouse?: { id: string; name: string; code?: string | null } | null;
};

// Using GlobalProduct for all product interactions
const parseMMYY = (raw: string): { mm: number; yyyy: number } | null => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const mm = Number(digits.slice(0, 2));
  const yy = Number(digits.slice(2, 4));
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { mm, yyyy: 2000 + yy };
};

const mmyyToIsoDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  return `${p.yyyy}-${String(p.mm).padStart(2, "0")}-01`;
};

const mmyyToIsoExpiryDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  const end = new Date(p.yyyy, p.mm, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
};

const addMonthsMMYY = (raw: string, months: number): string => {
  const p = parseMMYY(raw);
  if (!p) return "";
  const d = new Date(p.yyyy, p.mm - 1, 1);
  d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
};

const isoToMMYY = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
};

const getEmptyBatch = () => ({
  id: "",
  product_id: "",
  batch_number: "",
  mfg_date: "",
  expiry_date: "",
  received_qty: 0,
  remaining_qty: 0,
  cost_price: 0,
  landed_cost: 0,
  freight_cost_per_unit: 0,
  handling_cost_per_unit: 0,
  notes: "",
  input_qty_raw: 0,
  input_unit: "top" as "unit" | "top" | "packet" | "kg",
  input_cost_raw: 0,
  invoice_total: 0,
  additional_landed_costs: 0,
  warehouse_id: "",
  received_at: new Date().toISOString().slice(0, 10),
});

type SyncBatch = {
  id: string;
  product_id: string;
  landed_cost: number | null;
  received_at: string;
  product: GlobalProduct | null;
};

type BatchForm = ReturnType<typeof getEmptyBatch>;

export default function Stock() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ 
    category: 'Active',
    initialSearch: searchParams.get('q') || ''
  });

  const [selectedWarehouse, setSelectedWarehouse] = React.useState<string>("all");
  const parentRef = React.useRef<HTMLDivElement>(null);

  const { 
    data, 
    isLoading: loadingBatches,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInventory(debouncedSearch, selectedWarehouse, state.category);

  const allBatches = React.useMemo(() => {
    return data?.pages.flatMap(p => p.data) || [];
  }, [data]);

  const [products, setProducts] = React.useState<GlobalProduct[]>([]);
  const [items_as_products, setItemsAsProducts] = React.useState<GlobalProduct[]>([]);
  const [warehouses, setWarehouses] = React.useState<WarehouseType[]>([]);

  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [form, setForm] = React.useState<BatchForm>(getEmptyBatch());
  const [batchToDelete, setBatchToDelete] = React.useState<string | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);

  const loadMetadata = React.useCallback(async () => {
    try {
      const { data: p, error: pErr } = await supabase.from("products").select("*").order("name");
      const { data: w, error: wErr } = await supabase.from("warehouses").select("*");

      if (pErr) throw pErr;
      if (wErr) throw wErr;

      setProducts((p as GlobalProduct[]) ?? []);
      setWarehouses(w || []);
      setItemsAsProducts((p as GlobalProduct[]) || []);
    } catch (error: unknown) {
      console.error('[Context] Load metadata failed', error);
      toast.error(friendlyError(error));
    }
  }, []);

  React.useEffect(() => { loadMetadata(); }, [loadMetadata]);

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in30 = React.useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const sortedBatches = React.useMemo(() => {
    return [...allBatches].sort((a, b) => {
      const sort = state.filters.sort || 'Expiry (Soonest)';
      if (sort === 'Expiry (Soonest)') return (a.expiry_date || "").localeCompare(b.expiry_date || "");
      if (sort === 'Expiry (Latest)') return (b.expiry_date || "").localeCompare(a.expiry_date || "");
      if (sort === 'Stock (Low)') return a.remaining_qty - b.remaining_qty;
      if (sort === 'Stock (High)') return b.remaining_qty - a.remaining_qty;
      return 0;
    });
  }, [allBatches, state.filters.sort]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, { product: GlobalProduct; batches: (typeof allBatches[0])[]; total_qty: number }>();
    sortedBatches.forEach(b => {
      if (!b.product || !b.product_id) return;
      const existing = map.get(b.product_id) ?? { 
        product: b.product as unknown as GlobalProduct, 
        batches: [], 
        total_qty: 0 
      };
      existing.batches.push(b);
      existing.total_qty += (b.remaining_qty || 0);
      map.set(b.product_id, existing);
    });
    return Array.from(map.values()).sort((a, b) => {
      const nameA = a.product.name || "";
      const nameB = b.product.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [sortedBatches]);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? grouped.length + 1 : grouped.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  React.useEffect(() => {
    if (!lastItem) return;

    if (
      lastItem.index >= grouped.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, grouped.length, isFetchingNextPage, lastItem]);

  const categories = [
    { label: 'Active', count: data?.pages[0]?.count || 0 }, 
    { label: 'Expiring', count: 0 }, 
    { label: 'Expired', count: 0 },
    { label: 'All', count: data?.pages[0]?.count || 0 }
  ];

  const stockFilters = [
    { 
      id: 'sort', 
      label: 'Sort By', 
      icon: 'sort' as const, 
      options: ['Expiry (Soonest)', 'Expiry (Latest)', 'Stock (Low)', 'Stock (High)'] 
    }
  ];

  const save = async () => {
    if (!form.product_id) return toast.error("Select a product");
    if (!form.batch_number.trim()) return toast.error("Batch number required");
    if (!form.expiry_date) return toast.error("Expiry date required");
    const mfgIso = form.mfg_date ? mmyyToIsoDate(form.mfg_date) : null;
    const expIso = mmyyToIsoExpiryDate(form.expiry_date);
    if (form.mfg_date && !mfgIso) return toast.error("Mfg date must be MMYY");
    if (!expIso) return toast.error("Expiry date must be MMYY");
    if (!form.received_qty || form.received_qty <= 0) return toast.error("Quantity must be > 0");

    const payload = {
      product_id: form.product_id,
      batch_number: form.batch_number.trim(),
      mfg_date: mfgIso,
      expiry_date: expIso,
      received_qty: form.received_qty,
      remaining_qty: form.id ? form.remaining_qty : form.received_qty,
      cost_price: Number(form.cost_price || 0),
      landed_cost: Number(form.landed_cost || form.cost_price || 0),
      warehouse_id: form.warehouse_id || null,
      notes: form.notes || null,
      received_at: form.received_at || new Date().toISOString(),
    };

    const { error } = form.id 
      ? await supabase.from("inventory_batches").update(payload).eq("id", form.id)
      : await supabase.from("inventory_batches").insert(payload);

    if (error) {
      console.error('[Context] Save inventory batch failed', error);
      return toast.error(friendlyError(error));
    }
    
    // Automatically activate product if adding new stock
    if (!form.id && payload.received_qty > 0) {
      await supabase.from("products").update({ is_active: true }).eq("id", form.product_id);
    }
    
    // Recompute inventory aggregate after ANY save (insert or update)
    if (form.product_id) {
       await supabase.rpc('recompute_inventory', { _product_id: form.product_id });
    }
    
    toast.success(form.id ? "Batch updated" : "Batch received");

    // Sync Price Tiers for new batch
    if (!form.id && payload.landed_cost > 0) {
      const p = items_as_products.find(x => x.id === form.product_id);
      if (p) {
        const pricingProd: PricingProduct = {
          id: p.id,
          units_per_packet: p.units_per_packet,
          packets_per_case: p.packets_per_case,
          mrp: p.mrp,
          pack_size_value: p.pack_size_value,
          pack_size_unit: p.pack_size_unit
        };
        const tiers = autoCalcAllTiers(pricingProd, payload.landed_cost, true);
        const allTiersToUpsert = tiers.map(t => ({
          product_id: p.id,
          shop_type: t.shop_type,
          pack_type: t.pack_type,
          price: t.price,
          updated_at: new Date().toISOString()
        }));

        if (allTiersToUpsert.length > 0) {
          const { error: tierErr } = await supabase
            .from("product_price_tiers")
            .upsert(allTiersToUpsert, { onConflict: "product_id,shop_type,pack_type" });
          if (tierErr) {
            console.error("Auto pricing sync failed:", tierErr);
            toast.warning("Stock added, but price tier sync encountered an issue.");
          } else {
            toast.success(`Stock added & ${allTiersToUpsert.length} price tiers synchronized.`);
          }
        }
      }
    }

    setOpen(false); setEditOpen(false); setForm(getEmptyBatch());
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const startEdit = (b: Batch) => {
    // ALWAYS prefer items_as_products for latest multiplier info
    const p = items_as_products.find(x => x.id === b.product_id) || b.product;
    const info = derivePackaging(p || {});
    const cases = b.received_qty / (info.totalItemsInTop || 1);
    
    setForm({
      id: b.id,
      product_id: b.product_id,
      batch_number: b.batch_number,
      mfg_date: isoToMMYY(b.mfg_date),
      expiry_date: isoToMMYY(b.expiry_date),
      received_qty: b.received_qty,
      remaining_qty: b.remaining_qty,
      cost_price: b.cost_price,
      landed_cost: b.landed_cost || b.cost_price,
      notes: b.notes || "",
      input_qty_raw: Number(cases.toFixed(2)),
      input_unit: "top",
      warehouse_id: b.warehouse_id || "",
      input_cost_raw: (b.landed_cost || b.cost_price) * (info.totalItemsInTop || 1),
      received_at: b.received_at ? new Date(b.received_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setEditOpen(true);
  };

  const remove = async (id: string) => {
    const batch = (allBatches || []).find(b => b.id === id);
    const { error } = await supabase.from("inventory_batches").delete().eq("id", id);
    if (error) {
      console.error('[Context] Delete inventory batch failed', error);
      return toast.error(friendlyError(error));
    }
    
    if (batch?.product_id) {
      await supabase.rpc('recompute_inventory', { _product_id: batch.product_id });
    }
    
    toast.success("Batch deleted");
    refetch();
  };

  return (
    <div className="flex flex-col space-y-6 md:space-y-8 pb-32 md:pb-24">
      <PageHeader
        title="Stock"
        subtitle="Manage batch-wise inventory and expiry"
        onBack={() => navigate("/")}
        action={isAdmin && (
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              className="h-10 w-10 md:h-12 md:w-auto md:px-5 rounded-xl border shadow-sm font-bold text-xs gap-2"
              onClick={async () => {
                const tid = toast.loading("Reconciling stock...");
                try {
                  const { error } = await supabase.rpc('recompute_all_inventory', {});
                  if (error) throw error;
                  toast.success("Stock counts synchronized", { id: tid });
                  refetch();
                } catch (err: unknown) {
                  console.error('[Context] Recompute inventory failed', err);
                  toast.error(friendlyError(err), { id: tid });
                }
              }}
            >
              <Zap className="h-4 w-4 md:h-3.5 md:w-3.5 opacity-60" />
              <span className="hidden md:inline">Sync</span>
            </Button>
            <Button 
              className="h-10 px-4 md:h-12 md:px-6 rounded-xl border shadow-brand font-black uppercase tracking-widest text-[10px] gap-2 bg-amber-700 hover:bg-amber-800 text-white"
              onClick={() => navigate("/stock/grns")}
            >
              <Receipt className="h-4 w-4 md:hidden" />
              <Plus className="h-4 w-4 hidden md:inline" />
              <span className="md:hidden">GRN</span>
              <span className="hidden md:inline">Inward GRN</span>
            </Button>
          </div>
        )}
      />

      {/* Summary Stats Grid - 2x2 on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 px-4 lg:px-0">
        <StatCard 
          label="Total SKUs" 
          value={grouped.length.toLocaleString()} 
          color="slate"
        />
        <StatCard 
          label="Expiring Soon" 
          value={allBatches.filter(b => b.expiry_date && b.expiry_date <= in30 && b.expiry_date >= today).length.toLocaleString()} 
          color="amber"
          highlight
        />
        <StatCard 
          label="Total Units" 
          value={allBatches.reduce((acc, b) => acc + (b.remaining_qty || 0), 0).toLocaleString()} 
          color="blue"
        />
        <StatCard 
          label="Low Stock" 
          value={grouped.filter(g => g.total_qty < (g.product?.min_stock || 0)).length.toLocaleString()} 
          color="red"
          highlight
        />
      </div>

      {/* Top Action Tabs - Pill style for mobile */}
      <div className="flex items-center gap-2 w-full overflow-x-auto no-scrollbar px-4 lg:px-0">
        <StockTab 
          label="Movement" 
          isActive={false}
          onClick={() => navigate("/stock/movement")} 
        />
        <StockTab 
          label="Adjustments" 
          isActive={false}
          onClick={() => navigate("/stock/adjustments")} 
        />
        <StockTab 
          label="Relocation" 
          isActive={false}
          onClick={() => navigate("/stock/warehouse-transfers")} 
        />
        <StockTab 
          label="Audits" 
          isActive={false}
          onClick={() => navigate("/stock/audits")} 
        />
        <StockTab 
          label="Warehouses" 
          isActive={false}
          onClick={() => navigate("/stock/warehouses")} 
        />
      </div>

      {/* Search & Filters Section */}
      <div className="space-y-4 px-4 lg:px-0">
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
          <div className="flex-1 w-full relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-5 md:w-5 text-slate-400 group-focus-within:text-amber-700 transition-colors" />
            <Input 
              placeholder="Name, SKU or Batch..." 
              className="pl-9 md:pl-12 h-9 md:h-14 rounded-lg md:rounded-2xl border-slate-200 bg-white font-bold text-xs md:text-sm shadow-sm focus:border-amber-700/30 focus:ring-amber-700/5 transition-all w-full" 
              value={state.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 flex-1 md:h-14 md:w-64 rounded-lg md:rounded-2xl border-slate-200 bg-white shadow-sm flex items-center justify-between px-4 font-bold text-xs md:text-sm gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                    <span className="truncate">{selectedWarehouse === "all" ? "All Warehouses" : warehouses.find(w => w.id === selectedWarehouse)?.name}</span>
                  </div>
                  <Settings2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 bg-white shadow-2xl border-none">
                <div className="p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Filter by Warehouse</p>
                  <div className="space-y-1">
                     <button 
                      onClick={() => setSelectedWarehouse("all")}
                      className={cn(
                        "w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all",
                        selectedWarehouse === "all" ? "bg-amber-50 text-amber-900" : "hover:bg-slate-50 text-slate-600"
                      )}
                     >
                       All Warehouses
                     </button>
                     {warehouses.map(w => (
                       <button 
                        key={w.id}
                        onClick={() => setSelectedWarehouse(w.id)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all",
                          selectedWarehouse === w.id ? "bg-amber-50 text-amber-900" : "hover:bg-slate-50 text-slate-600"
                        )}
                       >
                         {w.name}
                       </button>
                     ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Filter Chips - Active/Expiring/etc */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {['Active', 'Expiring', 'Expired', 'All'].map((tab) => (
            <button
              key={tab}
              onClick={() => setCategory(tab)}
              className={cn(
                "h-8 md:h-10 px-4 md:px-6 rounded-lg md:rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                state.category === tab 
                  ? "bg-amber-50 border-amber-200 text-amber-700 ring-1 ring-amber-700/10" 
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Section */}
      <div className="px-4 lg:px-0">
        <AdaptiveTable
          data={sortedBatches}
          isLoading={loadingBatches}
          emptyMessage="No batches found."
          onRowClick={(b) => startEdit(b)}
          columns={[
            {
              header: "Product",
              id: "product",
              className: "pl-4",
              render: (b) => {
                const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
                return (
                  <div className="flex items-center gap-4 py-2">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      status === 'expired' ? "bg-red-50 border-red-100 text-red-500" :
                      status === 'warning' ? "bg-amber-50 border-amber-100 text-amber-500" :
                      "bg-slate-50 border-slate-100 text-slate-400"
                    )}>
                      <PackagePlus size={20} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-slate-900 leading-tight line-clamp-1">{b.product?.name}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{b.product?.sku}</span>
                    </div>
                  </div>
                );
              }
            },
            {
              header: "Batch",
              id: "batch",
              render: (b) => (
                <span className="font-bold text-slate-600 text-sm">{b.batch_number}</span>
              )
            },
            {
              header: "Stock",
              id: "stock",
              render: (b) => (
                <div className="flex flex-col">
                  <span className="text-base font-black tabular-nums text-slate-900">{b.remaining_qty.toLocaleString()}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">units</span>
                </div>
              )
            },
            {
              header: "Expiry",
              id: "expiry",
              render: (b) => {
                const date = new Date(b.expiry_date);
                const month = date.toLocaleString('default', { month: 'short' });
                const year = date.getFullYear();
                const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
                
                return (
                  <Badge className={cn(
                    "rounded-full px-3 py-1 font-bold text-[10px] border-none",
                    status === 'expired' ? "bg-red-100 text-red-700" :
                    status === 'warning' ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-100 text-emerald-700"
                  )}>
                    {month} {year}
                  </Badge>
                );
              }
            },
            {
              header: "",
              id: "actions",
              className: "text-right pr-4",
              render: (b) => (
                <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-400 hover:text-slate-600"
                    onClick={() => startEdit(b)}
                  >
                    <Edit2 size={14} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-9 w-9 rounded-xl border-red-50 bg-white hover:bg-red-50 transition-all text-slate-400 hover:text-red-500"
                    onClick={() => setBatchToDelete(b.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )
            }
          ]}
          renderMobileCard={(b) => {
            const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
            const date = new Date(b.expiry_date);
            const month = date.toLocaleString('default', { month: 'short' });
            const year = date.getFullYear();

            return (
              <div 
                className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 active:bg-slate-50 transition-colors shadow-sm relative group"
                onClick={() => startEdit(b)}
              >
                <div className={cn(
                  "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border",
                  status === 'expired' ? "bg-red-50 border-red-100 text-red-400" :
                  status === 'warning' ? "bg-amber-50 border-amber-100 text-amber-400" :
                  "bg-slate-50 border-slate-100 text-slate-300"
                )}>
                  <PackagePlus size={18} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-bold text-slate-900 leading-tight truncate">{b.product?.name}</h4>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{b.product?.sku}</p>
                  <div className="flex items-center gap-3 mt-1.5 focus:outline-none">
                    <span className="text-[11px] font-black text-slate-700 tabular-nums">{b.remaining_qty.toLocaleString()} <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight ml-0.5">units</span></span>
                    <Badge className={cn(
                      "rounded-full px-2 py-0.5 font-bold text-[9px] border-none scale-90 origin-left",
                      status === 'expired' ? "bg-red-50 text-red-600" :
                      status === 'warning' ? "bg-amber-50 text-amber-600" :
                      "bg-emerald-50 text-emerald-600"
                    )}>
                      {month} {year}
                    </Badge>
                  </div>
                </div>

                <div className="shrink-0">
                   <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Sticky Footer for Mobile */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-slate-100 md:hidden z-40">
           <Button 
            className="w-full h-14 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-amber-900/10 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
            onClick={() => navigate("/stock/grns")}
           >
             <Receipt className="h-4 w-4" />
             Inward GRN
           </Button>
        </div>
      )}



      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full md:max-w-2xl lg:max-w-3xl p-0 overflow-hidden border-l border-border/40 shadow-2xl bg-white focus:outline-none flex flex-col">
          <div className="h-full flex flex-col focus:outline-none relative">
            <div className="p-8 pb-4 shrink-0 bg-muted/20 border-b border-border/20">
              <SheetHeader className="mb-2 text-left">
                <SheetTitle className="text-3xl font-black tracking-tighter text-slate-900 leading-none">Modify batch</SheetTitle>
                <div className="flex flex-wrap items-center gap-3 mt-6">
                    {(() => {
                      const p = items_as_products.find(x => x.id === form.product_id);
                      if (!p) return <span className="text-xs font-medium opacity-30 italic">Hydrating profile...</span>;
                      return (
                        <>
                           <Badge className="bg-primary hover:bg-primary text-white border-none rounded-lg font-black text-[10px] uppercase tracking-widest px-3 py-1">
                              {p.sku}
                           </Badge>
                           <h3 className="text-xl font-black tracking-tighter text-foreground leading-none">{p.name}</h3>
                        </>
                      );
                    })()}
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 md:pb-32 space-y-8 no-scrollbar">
              <div className="grid grid-cols-2 gap-5">
                <Field label="Batch number">
                  <Input 
                    className="h-14 rounded-2xl border-none bg-muted/50 font-black text-lg focus-visible:ring-2 focus-visible:ring-primary/20 px-5 transition-all" 
                    value={form.batch_number} 
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value.toUpperCase() })} 
                  />
                </Field>
                <Field label="Expiry (MMYY)">
                  <Input
                    className="h-14 rounded-2xl border-none bg-muted/50 font-mono font-black text-lg text-center tracking-widest focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    placeholder="MMYY"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  />
                </Field>
              </div>

              <div className="rounded-[2rem] border border-border/40 bg-muted/20 p-8 space-y-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                     <PackagePlus size={18} />
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em]">Inventory Correction</Label>
                  </div>
                  {form.product_id && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-30">
                      1 {derivePackaging(items_as_products.find(x => x.id === form.product_id)).topUnit} = {derivePackaging(items_as_products.find(x => x.id === form.product_id)).totalItemsInTop} units
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 ring-2 ring-primary/5 p-6 rounded-3xl bg-primary/[0.01]">
                  <Field label={form.product_id ? `Inward count (${derivePackaging(items_as_products.find(x => x.id === form.product_id)).topUnit}s)` : "Total count"}>
                    <Input 
                      type="number" 
                      inputMode="decimal"
                      className="h-20 text-3xl font-black rounded-2xl bg-white border-2 border-border/10 focus-visible:border-primary/50 focus-visible:ring-0 text-center transition-all shadow-sm"
                      value={form.input_qty_raw || ""} 
                      onChange={(e) => {
                        const cases = Number(e.target.value);
                        const p = items_as_products.find(x => x.id === form.product_id);
                        const info = derivePackaging(p || {});
                        const totalUnits = cases * (info.totalItemsInTop || 1);
                        const isNewBatch = form.received_qty === form.remaining_qty;
                        setForm({ 
                          ...form, 
                          input_qty_raw: cases,
                          received_qty: totalUnits,
                          remaining_qty: isNewBatch ? totalUnits : form.remaining_qty
                        });
                      }} 
                    />
                  </Field>
                  <div className="space-y-4">
                    <Field label="Calculated base units">
                      <div className="h-20 bg-primary/5 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-primary/10">
                        <span className="text-3xl font-black text-primary tracking-tighter leading-none">{form.received_qty}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 mt-1">Total Pieces</span>
                      </div>
                    </Field>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50 block px-2">Current Physical Balance (Override)</Label>
                      <div className="flex gap-4">
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          className="h-16 rounded-2xl flex-1 font-black text-3xl text-primary border-none bg-white text-center shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20" 
                          value={form.remaining_qty} 
                          onChange={(e) => setForm({ ...form, remaining_qty: Number(e.target.value) })} 
                        />
                        <div className="w-1/3 flex items-center justify-center bg-muted/40 rounded-2xl border border-border/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Units Left
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-primary/20 bg-primary/[0.02] p-8 space-y-8 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                    <IndianRupeeIcon size={18} />
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em]">Valuation adjustment</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label={`Landed price / ${derivePackaging(items_as_products.find(x => x.id === form.product_id)).topUnit}`}>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-primary flex items-center justify-center font-black text-xl opacity-30 select-none group-focus-within:opacity-100 transition-opacity">₹</div>
                      <Input 
                        type="number" 
                        inputMode="decimal"
                        className="h-20 pl-14 rounded-2xl border-2 border-border/10 bg-white font-black text-3xl text-primary focus-visible:border-primary/50 focus-visible:ring-0 transition-all shadow-sm"
                        value={(() => {
                          const p = items_as_products.find(x => x.id === form.product_id);
                          const info = derivePackaging(p || {});
                          return Number(((form.landed_cost || 0) * (info.totalItemsInTop || 1)).toFixed(2));
                        })()} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const p = items_as_products.find(x => x.id === form.product_id);
                          const info = derivePackaging(p || {});
                          const unitInvoice = val / (info.totalItemsInTop || 1);
                          setForm({ ...form, landed_cost: unitInvoice, cost_price: unitInvoice });
                        }} 
                      />
                    </div>
                  </Field>
                  <div className="flex flex-col justify-center">
                    <div className="h-20 p-5 bg-white rounded-2xl border-2 border-dashed border-primary/10 flex flex-col items-center justify-center shadow-sm">
                      <span className="text-[10px] text-muted-foreground/40 font-black uppercase tracking-widest leading-none mb-1">Base Unit Price</span>
                      <span className="text-2xl font-black text-primary tracking-tighter leading-none">
                        {fmtINR(form.landed_cost)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Field label="Administrative logs / Audit notes">
                <textarea 
                  className="w-full h-32 rounded-3xl border-none bg-muted/50 font-bold text-sm p-6 focus-visible:ring-2 focus-visible:ring-primary/20 transition-all resize-none shadow-sm" 
                  value={form.notes} 
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} 
                  placeholder="Record why this modification was necessary for auditing..."
                />
              </Field>
            </div>

            <div className="p-8 bg-white border-t border-border/20 flex gap-4 shrink-0 mt-auto md:absolute md:bottom-0 md:left-0 md:right-0 z-30">
              <Button variant="outline" className="h-16 rounded-[2rem] flex-1 font-black uppercase text-[10px] tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all shadow-sm" onClick={() => setEditOpen(false)}>Discard</Button>
              <Button className="h-16 rounded-[2rem] flex-[2] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 bg-primary border-none text-white hover:translate-y-[-2px] transition-all active:translate-y-0" onClick={save}>
                Finalize Audit
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={batchToDelete !== null} onOpenChange={(open) => !open && setBatchToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border border-border shadow-md bg-white max-w-md">
          <AlertDialogHeader>
            <div className="mb-4 h-16 w-16 bg-destructive/5 rounded-2xl flex items-center justify-center text-destructive">
              <Trash2 className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Expunge Batch Reference?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-slate-600 font-medium leading-relaxed">
                <div className="mb-4">You are about to permanently delete this inventory batch.</div>
                <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/10 text-destructive">
                  <div className="text-[10px] font-black uppercase tracking-widest">System Implication</div>
                  <div className="text-sm font-bold mt-1 italic leading-tight">Total Stock will be recalculated automatically across the catalog.</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-11 rounded-xl font-bold text-xs flex-1 border shadow-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="h-11 rounded-xl font-bold text-xs flex-1 bg-destructive hover:bg-destructive/90 shadow-xl shadow-destructive/20 text-white border-none"
              onClick={() => {
                if (batchToDelete) {
                  remove(batchToDelete);
                  setBatchToDelete(null);
                }
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground ml-0.5">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value, color, highlight }: { label: string; value: string; color: "slate" | "amber" | "blue" | "red"; highlight?: boolean }) {
  const colors = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    blue: "text-blue-600",
    red: "text-red-500"
  };

  return (
    <Card className={cn(
      "rounded-xl md:rounded-2xl border-none p-4 md:p-6 shadow-sm",
      highlight ? (color === 'red' ? "bg-red-50" : color === 'amber' ? "bg-amber-50" : "bg-white") : "bg-white"
    )}>
      <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 md:mb-2 leading-tight">{label}</p>
      <p className={cn("text-xl md:text-3xl font-black tracking-tighter", colors[color])}>{value}</p>
    </Card>
  );
}

function StockTab({ label, isActive, onClick }: { label: string; isActive?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 md:h-12 px-5 md:px-6 rounded-lg md:rounded-xl border transition-all whitespace-nowrap text-[10px] md:text-[11px] font-black uppercase tracking-widest",
        isActive 
          ? "bg-amber-50 border-amber-200 text-amber-700 shadow-sm" 
          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
      )}
    >
      {label}
    </button>
  );
}

function QuickLink({ 
  icon: Icon, 
  label, 
  onClick, 
  color 
}: { 
  icon: LucideIcon, 
  label: string, 
  onClick: () => void, 
  color: "blue" | "emerald" | "amber" | "slate" | "indigo"
}) {
  const colors = {
    blue: "text-[#2563eb] hover:bg-blue-50/50",
    emerald: "text-[#059669] hover:bg-emerald-50/50",
    amber: "text-[#d97706] hover:bg-amber-50/50",
    slate: "text-[#475569] hover:bg-slate-50/50",
    indigo: "text-[#4f46e5] hover:bg-indigo-50/50"
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-black/5 bg-white transition-all active:scale-95 shrink-0 shadow-sm snap-start group hover:shadow-md hover:border-black/10 min-w-0",
        colors[color]
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110" />
      <span className="text-[9px] font-black uppercase tracking-tight truncate transition-colors">{label}</span>
    </button>
  );
}
