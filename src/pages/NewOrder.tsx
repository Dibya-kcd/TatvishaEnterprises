import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ShoppingBag, Store, Package, Trash2, ArrowLeft, Plus, Save, RefreshCw, Layers, Calendar, AlertTriangle, ChevronDown, ScanBarcode, Pencil, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtINR } from "@/lib/format";
import { formatStockDisplay } from "@/lib/packaging";
import { PricingProduct, PackType, getPackMultiplier } from "@/lib/pricing";

import { clampOrderDate } from "@/lib/dates";

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

import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Shop, Product, Line, PriceTierMap, PriceOverrideMap } from "@/types";
import { InlineShopSelector } from "@/components/orders/InlineShopSelector";
import { ProductCatalogSheet } from "@/components/orders/ProductCatalogSheet";
import { ProductCatalog } from "@/components/orders/ProductCatalog";
import { OrderLineItems } from "@/components/orders/OrderLineItems";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { useIsMobile, useIsTablet, useIsLaptop, useIsDesktop } from "@/lib/responsive";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/PageHeader";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";

type Warehouse = {
  id: string;
  name: string;
  code: string;
};

export default function NewOrder() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Only mobile is truly "compact" (single column with sheets), 
  // Tablet should usually show the dual-pane layout if enough width.
  const isCompact = isMobile;
  const isLaptop = useIsLaptop();
  const isDesktop = useIsDesktop();
  const { id: rawId } = useParams<{ id: string }>();
  const editId = rawId && rawId !== "null" ? rawId : undefined;
  const [searchParams] = useSearchParams();
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "owner";
  const navigate = useNavigate();

  const {
    shopId, setShopId,
    warehouseId, setWarehouseId,
    lines, setLines,
    discountAmount, setDiscountAmount,
    discountType, setDiscountType,
    notes, setNotes,
    orderDate, setOrderDate,
    outstandingBalance, setOutstandingBalance,
    priceTiers, setPriceTiers,
    priceOverrides, setPriceOverrides,
    totals,
    loading: loadingDraft,
    persistedId,
    originalStatus,
    addProduct,
    removeLine,
    updateLineQty,
    updateLinePackType,
    updateLinePrice,
    resetDraft
  } = useOrderDraft({ editId });

  const handleFullReset = async (keepContext = false) => {
    await resetDraft(keepContext);
    if (editId) {
      navigate('/orders/new', { replace: true });
    }
  };

  // Sync draft ID to URL for session resumption
  React.useEffect(() => {
    if (persistedId && !editId) {
      navigate(`/orders/${persistedId}/edit`, { replace: true });
    }
  }, [persistedId, editId, navigate]);

  const [shops, setShops] = React.useState<Shop[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const initialLoadRef = React.useRef(false);
  const [shopOpen, setShopOpen] = React.useState(false);
  const [prodOpen, setProdOpen] = React.useState(false);
  const [stayOpen, setStayOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [limitConfirmOpen, setLimitConfirmOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<"draft" | "pending_approval" | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [originalTotal, setOriginalTotal] = React.useState(0);
  const [currentStep, setCurrentStep] = React.useState<"selection" | "catalog" | "checkout" | "success">(
    (editId || searchParams.get("shop")) ? "catalog" : "selection"
  );
  const [lastOrderId, setLastOrderId] = React.useState<string | null>(null);
  const [recentShops, setRecentShops] = React.useState<string[]>([]);
  const [loadingLastOrder, setLoadingLastOrder] = React.useState(false);

  const handleRepeatLastOrder = async (sId: string) => {
    setLoadingLastOrder(true);
    try {
      const { data: lastOrder, error } = await supabase
        .from("orders")
        .select("id")
        .eq("shop_id", sId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("No previous orders found for this shop");
          return;
        }
        throw error;
      }

      // Load items from last order
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select(`
          product_id,
          quantity,
          unit_price,
          pack_type,
          gst_rate,
          products (*)
        `)
        .eq("order_id", lastOrder.id);
      
      if (itemsError) throw itemsError;

      if (!items || items.length === 0) {
        toast.error("Previous order has no items");
        return;
      }

      // Transform to lines
      const newLines = items.map(item => {
        const p = (item.products as unknown as Product);
        return {
          product_id: item.product_id,
          name: p.name,
          sku: p.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          packType: item.pack_type,
          gst_rate: item.gst_rate,
          unit_type: p.unit_type,
          units_per_packet: p.units_per_packet,
          packets_per_case: p.packets_per_case,
          units_per_case: p.units_per_case
        };
      });

      setLines(newLines);
      toast.success(`Replicated ${items.length} items from last order`);
      setCurrentStep("catalog");
    } catch (err) {
      console.error("Failed to repeat last order", err);
      toast.error(friendlyError(err));
    } finally {
      setLoadingLastOrder(false);
    }
  };

  // Load recent shops
  React.useEffect(() => {
    const saved = localStorage.getItem("recent_shops");
    if (saved) {
      try {
        setRecentShops(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse recent shops", e);
      }
    }
  }, []);

  const addToRecentShops = (id: string) => {
    setRecentShops(prev => {
      const updated = [id, ...prev.filter(x => x !== id)].slice(0, 5);
      localStorage.setItem("recent_shops", JSON.stringify(updated));
      return updated;
    });
  };

  const handleShopSelect = (id: string) => {
    setShopId(id);
    addToRecentShops(id);
    setCurrentStep("catalog");
  };

  // Skip auto-switch logic, as Sheet handles visibility now

  // Load original total for existing orders to adjust credit limit checks correctly
  React.useEffect(() => {
    if (editId && lines.length > 0 && originalTotal === 0) {
      setOriginalTotal(totals.total);
    }
  }, [editId, lines.length, totals.total, originalTotal]);

  // Before unload warning
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (lines.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [lines.length]);

  const shop = React.useMemo(() => {
    return shops.find(s => s.id === shopId);
  }, [shops, shopId]);

  // Handle URL shop param
  React.useEffect(() => {
    const shopParam = searchParams.get("shop");
    if (shopParam && shopParam !== "null" && !editId && !shopId) {
      setShopId(shopParam);
    }
  }, [searchParams, editId, setShopId, shopId]);

  const lineProductIds = React.useMemo(() => 
    lines.map(l => l.product_id).sort().join(','), 
    [lines]
  );

  const lastSyncedRef = React.useRef<string>("");

  const syncStockForWarehouse = React.useCallback(async (whId: string) => {
    const pidsStr = lineProductIds;
    const syncKey = `${whId}:${pidsStr}`;
    
    if (!pidsStr || syncKey === lastSyncedRef.current) return;
    lastSyncedRef.current = syncKey;

    try {
      const pids = pidsStr.split(',');
      const { data, error } = await supabase
        .from("v_product_stock_warehouse")
        .select("id, stock_base_units, avg_landed_cost")
        .eq("warehouse_id", whId)
        .in("id", pids);
      
      if (error) throw error;

      const stockMap = new Map((data ?? []).map((x) => [x.id, { 
        qty: Number(x.stock_base_units || 0), 
        cost: Number(x.avg_landed_cost || 0) 
      }]));

      setLines(prev => prev.map(l => {
        const s = stockMap.get(l.product_id);
        if (!s) return l;
        // Only update if changed to avoid unnecessary re-renders
        if (l.stock === s.qty && l.avg_landed_cost === s.cost) return l;
        return { ...l, stock: s.qty, avg_landed_cost: s.cost };
      }));
    } catch (err: unknown) {
      console.error('[Inventory] Stock sync failed', err);
      // Avoid toast spam in loops
    }
  }, [lineProductIds, setLines]); // Depend on stabilized IDs instead of raw lines

  const handleSkuSearch = async (sku: string) => {
    if (!sku.trim() || !warehouseId) return;
    setIsSearchingSku(true);
    try {
      const { data, error } = await supabase
        .from("v_product_stock_warehouse")
        .select("*")
        .eq("warehouse_id", warehouseId)
        .eq("sku", sku.trim())
        .limit(1)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("SKU mismatch: Entry not found in current warehouse pool");
        } else {
          toast.error(friendlyError(error));
        }
        return;
      }

      const p = {
        ...data,
        inventory: { 
          quantity: (data as unknown as { stock_base_units: number }).stock_base_units || 0, 
          avg_landed_cost: (data as unknown as { avg_landed_cost: number }).avg_landed_cost || 0 
        }
      } as unknown as Product;

      addProduct(p, shop);
      setSkuInput("");
      toast.success(`Appended: ${p.name}`);
    } catch (err: unknown) {
      console.error('[Inventory] Sku load failed', err);
      toast.error(friendlyError(err));
    } finally {
      setIsSearchingSku(false);
    }
  };

  // Initial catalog load
  React.useEffect(() => {
    (async () => {
      if (initialLoadRef.current) return;
      initialLoadRef.current = true;
      
      try {
        const [shopsRes, whRes] = await Promise.all([
          supabase.from("shops").select("id, name, gstin, phone, shop_type, credit_limit, discount_pct").eq("is_active", true).order("name"),
          supabase.from("warehouses").select("id, name, code").eq("is_active", true).order("name"),
        ]);
        if (shopsRes.error) throw shopsRes.error;
        if (whRes.error) throw whRes.error;

        const fetchedShops = (shopsRes.data ?? []) as Shop[];
        const fetchedWhs = (whRes.data ?? []) as Warehouse[];
        
        setShops(fetchedShops);
        setWarehouses(fetchedWhs);
        
        if (!editId && !warehouseId && fetchedWhs.length > 0) {
          const userWh = fetchedWhs.find(w => w.id === currentUser?.warehouse_id);
          const mainWh = fetchedWhs.find(w => w.name === 'Main Warehouse');
          setWarehouseId(userWh?.id || mainWh?.id || fetchedWhs[0].id);
        }
      } catch (err: unknown) {
        console.error('[Catalog] Component load failure', err);
        toast.error(friendlyError(err));
      }
    })();
  }, [editId, currentUser, setWarehouseId, warehouseId]); // Keep essential dependencies but guard with ref

  // Sync stock on warehouse change
  React.useEffect(() => {
    if (!warehouseId || warehouseId === "null" || loadingDraft) return;
    syncStockForWarehouse(warehouseId);
  }, [warehouseId, loadingDraft, syncStockForWarehouse]);

  // Fetch shop metadata
  React.useEffect(() => {
    if (!shopId) {
      setPriceTiers({});
      setPriceOverrides({});
      setOutstandingBalance(0);
      return;
    }
    (async () => {
      try {
        const selectedShop = shops.find(s => s.id === shopId);
        if (!selectedShop) return;

        const [tiersRes, overridesRes, balanceRes] = await Promise.all([
          supabase.from("product_price_tiers").select("*").eq("shop_type", selectedShop.shop_type),
          supabase.from("shop_product_price_overrides").select("*").eq("shop_id", shopId),
          supabase.rpc("get_shop_outstanding_balance", { target_shop_id: shopId }),
        ]);

        if (tiersRes.error) throw tiersRes.error;
        if (overridesRes.error) throw overridesRes.error;

        setOutstandingBalance(Number(balanceRes.data || 0));

        const tMap: PriceTierMap = {};
        if (selectedShop.shop_type) {
          tMap[selectedShop.shop_type] = {};
          (tiersRes.data ?? []).forEach((row) => {
            const r = row as unknown as { product_id: string; pack_type: string; price: number };
            if (!tMap[selectedShop.shop_type!][r.product_id]) tMap[selectedShop.shop_type!][r.product_id] = {};
            tMap[selectedShop.shop_type!][r.product_id][r.pack_type as PackType] = Number(r.price);
          });
        }
        setPriceTiers(tMap);

        const oMap: PriceOverrideMap = {};
        oMap[shopId] = {};
        (overridesRes.data ?? []).forEach((row) => {
          const r = row as unknown as { product_id: string; pack_type: string; price: number };
          if (!oMap[shopId][r.product_id]) oMap[shopId][r.product_id] = {};
          oMap[shopId][r.product_id][r.pack_type as PackType] = Number(r.price);
        });
        setPriceOverrides(oMap);
      } catch (err: unknown) {
        console.error('[Pricing] Logic failure', err);
        toast.error(friendlyError("Pricing matrix could not be resolved"));
      }
    })();
  }, [shopId, shops, setPriceTiers, setPriceOverrides, setOutstandingBalance]);

  const handleOrderAction = async (status: "draft" | "pending_approval") => {
    if (!shopId) return toast.error("Select target entity (Shop)");
    if (!lines.length) return toast.error("Entry list is empty");

    // G3: Prevent editing dispatched/delivered orders directly to protect inventory
    if (originalStatus && ["dispatched", "delivered"].includes(originalStatus)) {
      return toast.error(`Cannot edit a ${originalStatus} order directly. Please revert to 'Approved' status first to restore inventory.`);
    }

    const tid = toast.loading("Verifying accounting limits...");
    const { data: latestBalance } = await supabase.rpc("get_shop_outstanding_balance", { target_shop_id: shopId });
    toast.dismiss(tid);

    const currentBalance = Number(latestBalance || 0);
    const effectiveBalance = editId ? (currentBalance - originalTotal) : currentBalance;
    setOutstandingBalance(currentBalance);

    const isOverLimit = shop && shop.credit_limit > 0 && (effectiveBalance + totals.total) > shop.credit_limit;

    if (isOverLimit && status === "pending_approval") {
      setPendingStatus(status);
      setLimitConfirmOpen(true);
      return;
    }

    const outOfStock = lines.filter(l => {
      const multiplier = getPackMultiplier(l as unknown as Product, l.packType as PackType);
      return (l.quantity * multiplier) > (l.stock || 0);
    });

    if (outOfStock.length > 0) {
      return toast.error(`Stock violation: ${outOfStock.map(l => l.name).join(", ")}`);
    }

    performSubmit(status, Boolean(isOverLimit));
  };

  const performSubmit = async (status: "draft" | "pending_approval", overLimit = false) => {
    const clampedDate = clampOrderDate(orderDate);
    if (clampedDate !== orderDate) {
      setOrderDate(clampedDate);
    }

    setBusy(true);
    // If we are editing an already-approved (or higher) order, preserve its status.
    // Don't send it back through the approval queue unnecessarily.
    const statusesToPreserve = ["approved", "dispatched", "delivered"];
    const finalStatus = (editId && originalStatus && statusesToPreserve.includes(originalStatus))
      ? (originalStatus as Database["public"]["Enums"]["order_status"])
      : (status === "draft" ? "draft" : "pending_approval") as Database["public"]["Enums"]["order_status"];

    try {
      let orderIdToUse = editId;

      const orderData = {
        shop_id: shopId,
        warehouse_id: warehouseId,
        status: finalStatus as Database["public"]["Enums"]["order_status"],
        subtotal: totals.subtotal,
        gst_total: totals.gst,
        total: totals.total,
        discount_amount: totals.calculatedDiscount,
        discount_type: discountType,
        notes: notes || null,
        order_date: orderDate,
        is_over_limit: overLimit
      };

      const itemsData = lines.filter(l => !l.isRemoved).map(l => {
        const lineExclusive = l.unit_price * l.quantity;
        const rate = Number(l.gst_rate) || 0;
        const lineTax = lineExclusive * (rate / 100);
        return {
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          gst_rate: rate,
          pack_type: l.packType as Database["public"]["Enums"]["pack_type"],
          line_total: lineExclusive + lineTax,
          line_total_tax_exclusive: lineExclusive,
          line_tax_amount: lineTax,
          batch_id: l.batch_id
        };
      });

      if (editId || (!currentUser?.isPinUser)) {
        const orderPayload = {
          shop_id: shopId,
          warehouse_id: warehouseId,
          status: finalStatus,
          subtotal: totals.subtotal,
          gst_total: totals.gst,
          total: totals.total,
          discount_amount: totals.calculatedDiscount,
          discount_type: discountType,
          notes: notes || null,
          order_date: orderDate,
          is_over_limit: overLimit,
          updated_at: new Date().toISOString()
        };

        const { data: resultId, error: rpcError } = await supabase.rpc('save_draft_order_v3', {
          p_order_id: editId || null,
          p_order_data: orderPayload,
          p_items: itemsData
        });
        
        if (rpcError) throw rpcError;
        orderIdToUse = resultId;
      } else if (currentUser?.isPinUser && currentUser?.session_token) {
        const { data, error } = await supabase.rpc('insert_order_with_pin_v2', {
          p_session_token: currentUser.session_token,
          p_order_data: orderData,
          p_items_data: itemsData
        });
        if (error) throw error;
        const result = data as { success: boolean; error?: string; order_id?: string };
        if (!result.success) throw new Error(result.error);
        orderIdToUse = result.order_id!;
      }

      toast.success(editId ? "Order updated" : (status === "draft" ? "Saved as draft" : "Order submitted"));
      setLastOrderId(orderIdToUse!);
      setCurrentStep("success");
    } catch (err: unknown) {
      console.error('[Manifest] Submit failed', err);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateShop = async (fields: Partial<Shop>) => {
    if (!shop) return;
    try {
      const { error } = await supabase.from('shops').update(fields).eq('id', shop.id);
      if (error) throw error;
      
      setShops(prev => prev.map(s => s.id === shop.id ? { ...s, ...fields } : s));
      toast.success("Shop updated successfully");
    } catch (err) {
      console.error("Shop update error:", err);
      toast.error(friendlyError(err));
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "selection":
        return (
          <div className="space-y-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="max-w-2xl mx-auto space-y-10">
                
                <div className="space-y-6">
                  <InlineShopSelector 
                    shopId={shopId} 
                    shops={shops} 
                    outstandingBalance={outstandingBalance} 
                    onSelect={handleShopSelect} 
                    loading={loadingDraft}
                  />
                  
                  {recentShops.length > 0 && !shopId && (
                    <div className="space-y-4">
                      <Label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Recent Shops</Label>
                      <div className="flex flex-wrap gap-2.5">
                        {recentShops.map(id => {
                          const s = shops.find(x => x.id === id);
                          if (!s) return null;
                          return (
                            <Badge 
                              key={id} 
                              variant="secondary" 
                              className="cursor-pointer hover:bg-slate-200 transition-all py-2.5 px-5 rounded-2xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm active:scale-95"
                              onClick={() => handleShopSelect(id)}
                            >
                              {s.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {shopId && (
                   <div className="pt-6 space-y-4">
                      <Button 
                         onClick={() => setCurrentStep("catalog")}
                         className="w-full h-16 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                         Continue to Catalog
                         <ChevronDown className="h-5 w-5 -rotate-90" />
                      </Button>
                      
                      <Button 
                         variant="outline"
                         onClick={() => handleRepeatLastOrder(shopId)}
                         disabled={loadingLastOrder}
                         className="w-full h-12 rounded-2xl border-slate-200 text-slate-600 font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                         {loadingLastOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                         Repeat Last Order
                      </Button>
                   </div>
                )}
             </div>
          </div>
        );
      case "catalog":
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
             {/* Sticky Header for catalog */}
             <div className={cn(
               "flex items-center justify-between gap-4 bg-white/60 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-border/10 sticky z-30 transition-all duration-300",
               "top-24" // Adjusted for sticky top-0 main header height
             )}>
                 <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="h-6 px-2 text-[10px] font-bold bg-slate-50 border-slate-200 shrink-0 text-slate-500">
                      {warehouses.find(w => w.id === warehouseId)?.name || "Main WH"}
                    </Badge>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                       Outstanding: {fmtINR(outstandingBalance)}
                    </span>
                    {shop?.credit_limit > 0 && (outstandingBalance + totals.total) > shop.credit_limit && (
                      <Badge variant="destructive" className="animate-pulse bg-rose-500 text-white border-none h-6 px-3 rounded-full font-black text-[9px] uppercase">
                        Over Limit (₹{(outstandingBalance + totals.total - shop.credit_limit).toFixed(0)})
                      </Badge>
                    )}
                 </div>

                {lines.length > 0 && (
                  <Button 
                    variant="outline"
                    size="icon"
                    onClick={() => setCartOpen(true)}
                    className="h-10 w-10 rounded-xl relative hover:bg-slate-50 transition-colors shrink-0 border-slate-100"
                  >
                    <ShoppingBag className="h-4.5 w-4.5 text-slate-600" />
                    <Badge className="absolute -top-1.5 -right-1.5 h-4.5 w-4.5 rounded-full p-0 flex items-center justify-center font-black text-[9px] bg-brand-primary text-white border-2 border-white shadow-sm">
                      {lines.filter(l => !l.isRemoved).length}
                    </Badge>
                  </Button>
                )}
             </div>

             <div className="flex-1 min-h-0 rounded-2xl md:rounded-3xl overflow-hidden border border-border/20 shadow-xl bg-white relative">
                <ProductCatalog 
                  warehouseId={warehouseId} 
                  lines={lines} 
                  onAdd={(p, b) => addProduct(p, shop, b)} 
                  onRemove={(id, bid) => removeLine(id, bid)}
                  onUpdateQty={(id, q, bid) => updateLineQty(id, q, bid)}
                  onUpdatePackType={(id, pt, bid) => updateLinePackType(id, pt, shop, bid)}
                  onUpdatePrice={updateLinePrice}
                  onViewReview={() => setCartOpen(true)}
                  resolvePrice={(p) => {
                    return { price: p.mrp || 0, source: 'MRP' }; 
                  }}
                  totals={totals}
                  isEditing={!!editId}
                  shop={shop}
                />
             </div>
          </div>
        );
      case "checkout":
        return (
          <div className="max-w-3xl mx-auto space-y-8 py-6 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="flex items-center justify-between mb-0">
                <Button variant="ghost" onClick={() => setCurrentStep("catalog")} className="h-8 rounded-xl font-bold text-[10px] gap-2 text-slate-400 hover:text-slate-600 px-0 hover:bg-transparent">
                   <ArrowLeft className="h-3.5 w-3.5" />
                   Back to catalog
                </Button>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Checkout Review</h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-12 space-y-4">
                   <Card className="border border-border/40 rounded-[1.25rem] bg-white shadow-sm overflow-hidden">
                      <CardContent className="p-3 flex flex-row items-center divide-x divide-slate-100 gap-0">
                         <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                            <div className="h-9 w-9 rounded-xl bg-brand-primary/5 flex items-center justify-center text-brand-primary shrink-0">
                               <Package className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <Label className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 block">Warehouse</Label>
                               <Select value={warehouseId} onValueChange={setWarehouseId} disabled={loadingDraft}>
                                  <SelectTrigger className="h-5 p-0 rounded-none bg-transparent border-none font-bold text-xs text-slate-900 shadow-none focus:ring-0 truncate w-full flex flex-row-reverse justify-end gap-1.5 text-left">
                                     <SelectValue placeholder="Warehouse..." />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-2xl border-border shadow-xl">
                                     {warehouses.map((w) => (
                                        <SelectItem key={w.id} value={w.id} className="text-xs font-semibold py-3">{w.name}</SelectItem>
                                     ))}
                                  </SelectContent>
                               </Select>
                            </div>
                         </div>
                         
                         <div className="flex items-center gap-3 flex-1 min-w-0 pl-3">
                            <div className="h-9 w-9 rounded-xl bg-brand-accent/30 flex items-center justify-center text-brand-primary shrink-0">
                               <Calendar className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <Label className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 block">Order Date</Label>
                               <Input 
                                  type="date" 
                                  max={new Date().toISOString().slice(0, 10)}
                                  className="h-5 p-0 rounded-none bg-transparent border-none font-bold text-xs text-slate-900 shadow-none focus-visible:ring-0 px-0 w-full" 
                                  value={orderDate} 
                                  onChange={e => setOrderDate(e.target.value)} 
                               />
                            </div>
                         </div>
                      </CardContent>
                   </Card>
                   <OrderSummaryCard 
                    lines={lines}
                    totals={totals} 
                    shop={shop} 
                    outstandingBalance={outstandingBalance} 
                    discountType={discountType} 
                    setDiscountType={setDiscountType} 
                    discountAmount={discountAmount} 
                    setDiscountAmount={setDiscountAmount} 
                    notes={notes} 
                    setNotes={setNotes} 
                    onAction={handleOrderAction} 
                    busy={busy} 
                    isAdmin={isAdmin}
                    onUpdateShop={handleUpdateShop}
                  />
                </div>
             </div>
          </div>
        );
      case "success":
        return (
           <div className="h-[70vh] flex flex-col items-center justify-center text-center p-6 animate-in zoom-in-95 duration-500">
              <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-8 shadow-inner">
                 <Check className="h-12 w-12 stroke-[3]" />
              </div>
              <div className="space-y-4 max-w-md">
                 <h2 className="text-3xl font-bold tracking-tight text-slate-900">Order Successful!</h2>
                 <p className="text-slate-500 font-medium">
                    Order <span className="font-bold text-slate-900">#{lastOrderId?.slice(0, 8)}</span> has been recorded. 
                    Value: <span className="font-bold text-slate-900">{fmtINR(totals.total)}</span>
                 </p>
                 <div className="pt-8 flex flex-col gap-3 w-full">
                    <Button 
                       onClick={() => navigate(`/orders/${lastOrderId}`)}
                       className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-base shadow-xl active:scale-95 transition-all"
                    >
                       View Order Detail
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                       <Button 
                          variant="outline" 
                          onClick={handleFullReset}
                          className="h-12 rounded-xl font-bold text-xs uppercase tracking-wider"
                       >
                          New Order
                       </Button>
                       <Button 
                          variant="outline" 
                          onClick={() => {
                             handleFullReset(true);
                             setCurrentStep("catalog");
                          }}
                          className="h-12 rounded-xl font-bold text-xs uppercase tracking-wider"
                       >
                          Same Shop
                       </Button>
                    </div>
                 </div>
              </div>
           </div>
        );
      default:
        return null;
    }
  };

  if (editId && loadingDraft) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <Loader2 className="h-14 w-14 animate-spin text-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="h-5 w-5 text-primary opacity-40" />
          </div>
        </div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Loading order...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Brand Header / Editing Banner */}
        <div className="bg-white border-b border-slate-100 p-6 pt-8 sm:pt-10 rounded-b-[2rem] shadow-sm sticky top-0 z-40 overflow-hidden">
          <div className="relative z-10 flex items-center justify-between max-w-7xl mx-auto">
            <div className="space-y-1">
               <h1 className="text-2xl font-black tracking-tight text-[#c2410c]">
                 {editId ? "Edit Order" : "New Order"}
               </h1>
               <p className="text-xs font-medium text-slate-400">
                {currentStep === "selection" ? "Select outlet to begin" : (shop?.name || "Order summary")}
              </p>
            </div>
            {shop?.credit_limit > 0 && (outstandingBalance + totals.total) > shop.credit_limit && (
               <div className="hidden sm:flex items-center gap-3 bg-rose-50 border border-rose-100 px-4 py-2 rounded-2xl animate-in fade-in slide-in-from-top-1">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider leading-none">Credit Limit Warning</span>
                    <span className="text-[11px] font-bold text-rose-900 leading-none mt-1">
                      Over by {fmtINR(outstandingBalance + totals.total - shop.credit_limit)}
                    </span>
                  </div>
               </div>
            )}
            <div className="flex items-center gap-3">
               {((!editId && currentStep !== "selection") || persistedId) && (
                 <Button 
                   variant="ghost"
                   size="icon"
                   onClick={handleFullReset}
                   className="h-10 w-10 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                 >
                   <RefreshCw size={18} />
                 </Button>
               )}
               <Button 
                 variant="outline" 
                 size="icon" 
                 onClick={() => {
                   if (editId) navigate(`/orders/${editId}`);
                   else navigate('/orders');
                 }} 
                 className="h-10 w-10 rounded-xl border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
               >
                 <X size={20} />
               </Button>
            </div>
          </div>
        </div>

      <ResponsiveContainer className="pb-32 px-1 sm:px-4 mt-6">
        {/* Unified view handles its own structure when editing */}
        
        {/* Recent Shops Header - only in Selection mode */}
        {shop?.credit_limit > 0 && (outstandingBalance + totals.total) > shop.credit_limit && (
           <div className="sm:hidden mb-4 flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl animate-in zoom-in-95">
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.1em] leading-none mb-1">Account limit exceeded</p>
                <p className="text-xs font-bold text-rose-900 leading-tight">
                  Selection carries ₹{fmtINR(outstandingBalance + totals.total - shop.credit_limit)} excess liability.
                </p>
              </div>
           </div>
        )}
        {renderStep()}
      </ResponsiveContainer>

      {/* Unified Final Bar (Sticky Footer) */}
      {lines.length > 0 && currentStep === "catalog" && !isMobile && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50 safe-pb">
           <div 
             className={cn(
               "h-20 rounded-[1.5rem] shadow-2xl flex items-center justify-between px-6 border active:scale-95 transition-all cursor-pointer",
               editId ? "bg-amber-600 border-amber-500 shadow-amber-900/20" : "bg-slate-900 border-white/5 shadow-slate-900/20"
             )}
             onClick={() => {
                if (editId) setCurrentStep("checkout");
                else setCartOpen(true);
             }}
           >
              <div className="flex flex-col">
                 <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest leading-none", editId ? "text-white/70" : "text-slate-500")}>
                      {lines.filter(l => !l.isRemoved).length} items
                    </span>
                    {editId && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                 </div>
                 <span className="text-xl font-bold text-white tabular-nums">{fmtINR(totals.total)}</span>
              </div>
              
              <Button className={cn(
                "h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.1em] border-none",
                editId ? "bg-white text-amber-600 hover:bg-white/90" : "bg-white/10 text-white hover:bg-white/20"
                )}>
                 {editId ? "Review Order →" : "Review cart"}
              </Button>
           </div>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent 
          side={isMobile ? "bottom" : "right"} 
          className={cn(
            "p-0 flex flex-col border-none shadow-2xl bg-slate-50",
            isMobile ? "h-[92vh] rounded-t-[2.5rem]" : "w-full max-w-[420px] sm:max-w-[540px]"
          )}
        >
          <SheetHeader className="p-4 sm:p-5 bg-white border-b border-border/40 shrink-0">
             <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <SheetTitle className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter leading-none mb-1 sm:mb-1.5 uppercase">Basket</SheetTitle>
                   <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{lines.length} Items Indexed</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-brand-primary/10 text-brand-primary border-none rounded-full px-3 h-6 flex items-center justify-center font-black text-[10px]">
                    {lines.length}
                  </Badge>
                </div>
             </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 px-3 sm:px-5">
              <div className="py-3 sm:py-4 space-y-2 sm:space-y-3">
                <OrderLineItems 
                  lines={lines} 
                  shop={shop} 
                  onRemove={removeLine} 
                  onUpdateQty={updateLineQty} 
                  onUpdatePackType={(id, pt, bid) => updateLinePackType(id, pt, shop, bid)} 
                  onUpdatePrice={updateLinePrice} 
                />
              </div>
            </ScrollArea>
            
            <div className="p-6 bg-white border-t border-border/40 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2 px-1">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Value</span>
                     <span className="text-2xl font-bold text-slate-900 tabular-nums">{fmtINR(totals.total)}</span>
                  </div>
               </div>
               <Button 
                onClick={() => {
                  setCartOpen(false);
                  setCurrentStep("checkout");
                }}
                className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-xl active:scale-95 transition-all"
                disabled={busy || lines.length === 0}
               >
                 Review & Checkout
               </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={limitConfirmOpen} onOpenChange={setLimitConfirmOpen}>
        <AlertDialogContent className="rounded-3xl border border-border/40 shadow-2xl p-8 animate-in zoom-in-95">
          <AlertDialogHeader className="space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-2">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Credit Limit Violation</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500 leading-relaxed">
              Order value <span className="text-slate-950 font-bold">{fmtINR(totals.total)}</span> exceeds the shop's credit limit. 
              Do you want to save this as draft or proceed with a manual override?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="rounded-xl h-12 font-bold text-xs uppercase tracking-wider border-slate-200 flex-1 hover:bg-slate-50 transition-colors">Abort</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl h-12 font-bold text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-lg flex-1 transition-all active:scale-95" onClick={() => performSubmit("pending_approval", true)}>Override & Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
