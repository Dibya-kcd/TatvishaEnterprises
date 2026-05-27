import { toast } from "sonner";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, X, Loader2, Filter, ShoppingBag, Check, Sparkles, Calendar, ChevronRight, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtINR, formatDivisionCategory, statusColor, statusLabel } from "@/lib/format";
import { Batch, Product, Line, Shop, NewOrderPackType } from "@/types";
import { useRecommendedBatches } from "@/hooks/useRecommendedBatches";
import { useIsCompact } from "@/lib/responsive";
import { Badge } from "@/components/ui/badge";
import { ResponsiveGrid } from "@/components/ui/responsive-ui";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { OrderLineItems } from "@/components/orders/OrderLineItems";

interface ProductCatalogProps {
  warehouseId: string;
  lines: Line[];
  onAdd: (p: Product, b?: Batch & { isFifoPriority?: boolean }) => void;
  onRemove: (productId: string, batchId?: string) => void;
  onUpdateQty: (productId: string, qty: number, batchId?: string) => void;
  onUpdatePackType: (productId: string, packType: NewOrderPackType, batchId?: string) => void;
  onUpdatePrice: (productId: string, price: number, batchId?: string) => void;
  resolvePrice: (p: Product) => { price: number; source: string };
  totals: { subtotal: number; total: number };
  onClose?: () => void;
  onViewReview?: () => void;
  className?: string;
  isSheet?: boolean;
  isEditing?: boolean;
  shop?: Shop;
  orderNumber?: string;
  status?: string;
  orderDate?: string;
  onUpdateDate?: (date: string) => void;
}

export const ProductCatalog = ({
  warehouseId,
  lines,
  onAdd,
  onRemove,
  onUpdateQty,
  onUpdatePackType,
  onUpdatePrice,
  resolvePrice,
  totals,
  onClose,
  onViewReview,
  className,
  isSheet = false,
  isEditing = false,
  shop,
  orderNumber,
  status,
  orderDate,
  onUpdateDate
}: ProductCatalogProps) => {
  const isCompact = useIsCompact();
  const [prodQ, setProdQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [prodCategoryFilter, setProdCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"margin" | "newest" | "alphabetical">("alphabetical");

  // Keep a stable record of batch details we've seen
  const [batchCache, setBatchCache] = useState<Record<string, Batch>>({});

  // Debounce search and manage suggestions visibility
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(prodQ);
      setShowSuggestions(prodQ.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [prodQ]);

  const {
    data: batchData,
    isLoading: isBatchesLoading
  } = useRecommendedBatches(warehouseId, debouncedQ, !!warehouseId && warehouseId !== "null");

  const isLoading = isBatchesLoading;

  const batches = useMemo(() => {
    const fetched = batchData?.pages.flatMap(page => page.data) ?? [];
    return fetched;
  }, [batchData]);

  // Update cache whenever we see new batches
  useEffect(() => {
    if (batches.length > 0) {
      setBatchCache(prev => {
        const next = { ...prev };
        batches.forEach(b => {
          if (b.id) next[b.id] = b;
        });
        return next;
      });
    }
  }, [batches]);

  // The "Main List" shows all available items in stock, plus any items already in the cart
  const filteredBatches = useMemo(() => {
    // Get all active (not removed) lines from the cart
    const cartLines = lines.filter(l => !l.isRemoved);
    
    // Convert cart lines into Batch-compatible format for grid rendering
    const cartBatches = cartLines.map(line => {
      const cached = line.batch_id ? batchCache[line.batch_id] : null;
      return {
        id: line.batch_id || line.product_id,
        batch_number: line.batch_number || line.sku || "N/A",
        product_id: line.product_id,
        expiry_date: cached?.expiry_date || "N/A",
        remaining_qty: line.stock,
        product: {
          id: line.product_id,
          name: line.name,
          mrp: line.mrp,
          division_category: line.division_category || "",
          unit_type: line.unit_type,
          pack_size_value: line.pack_size_value,
          pack_size_unit: line.pack_size_unit,
          units_per_packet: line.units_per_packet || 1,
          packets_per_case: line.packets_per_case || 1,
          units_per_case: line.units_per_case || 1,
          item_pack_type: line.item_pack_type || "",
        } as Product,
        isFifoPriority: line.is_fifo
      } as Batch & { isFifoPriority?: boolean };
    });

    // Sub-batches set of IDs already in the cart to avoid duplicate rendering of available batches
    const cartBatchIds = new Set(cartLines.map(l => l.batch_id || l.product_id));

    // Exclude available items that are already in the cart
    const availableBatchesNotInCart = batches.filter(b => b && b.id && !cartBatchIds.has(b.id));

    // Apply category filter ONLY on items NOT in the cart
    // (Existing items in the cart are NEVER filtered out as requested)
    const filteredAvailable = availableBatchesNotInCart.filter(b => {
      if (prodCategoryFilter === "All") return true;
      return b.product && formatDivisionCategory(b.product.division_category) === prodCategoryFilter;
    });

    // Merge cart items with filtered available items
    const combined = [...cartBatches, ...filteredAvailable];

    // Apply selected sorting criteria
    if (sortBy === "alphabetical") {
      combined.sort((a, b) => (a.product?.name || "").localeCompare(b.product?.name || ""));
    } else if (sortBy === "margin") {
      combined.sort((a, b) => (b.product?.mrp || 0) - (a.product?.mrp || 0));
    } else if (sortBy === "newest") {
      combined.sort((a, b) => {
        const idA = a.id || "";
        const idB = b.id || "";
        return idB.localeCompare(idA);
      });
    }

    return combined;
  }, [lines, batches, batchCache, prodCategoryFilter, sortBy]);

  // Categories list containing ALL categories present in available warehouse batches and current cart items
  const categoriesListing = useMemo(() => {
    const cats = new Set<string>();
    
    // Obtain categories from all available batches in the warehouse
    batches.forEach(b => {
      if (b.product?.division_category) {
        cats.add(formatDivisionCategory(b.product.division_category));
      }
    });

    // Also include any categories present in current cart items to be comprehensive
    lines.forEach(line => {
      if (line.division_category) {
        cats.add(formatDivisionCategory(line.division_category));
      }
    });

    return ["All", ...Array.from(cats)].sort();
  }, [batches, lines]);

  const handleAdd = (p: Product, b?: Batch) => {
    // Tactile confirmation on Android if available
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(40);
    }
    onAdd(p, b);
    toast.success(`Added ${p.name}${b ? ` (Batch: ${b.batch_number})` : ''}`, {
      duration: 1500,
      position: isCompact ? "top-center" : "bottom-right"
    });
  };

  return (
    <div className={cn("flex-1 min-h-0 flex flex-col relative overflow-hidden bg-white rounded-t-2xl md:rounded-t-3xl border border-slate-100 shadow-sm", className)}>
      {/* Header Area */}
      <div className={cn("px-4 py-1 shrink-0 flex items-center justify-between")}>
          <div className="flex items-center gap-6 flex-1">
            {!isCompact && <h2 className="text-base font-semibold text-slate-900 tracking-tight shrink-0">Storefront</h2>}
         </div>
          <div className="flex items-center gap-3 ml-4">
            {onClose && !isEditing && (
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-10 w-10 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
      </div>
      
      {/* Search & Filter Bar */}
      <div className={cn("px-4 py-2 bg-transparent shrink-0 relative")}>
        {isEditing && orderNumber && (
          <div className="flex flex-col gap-3 mb-6 px-1">
             {/* Line 1: Order ID */}
             <div className="w-full">
                <span className="text-sm sm:text-2xl font-black text-slate-900 tracking-tight">
                  #{orderNumber}
                </span>
             </div>

              {/* Line 2: Status Badge + Date */}
              {(status || orderDate) && (
                <div className="flex flex-wrap items-center gap-3 w-full pt-2 border-t border-slate-50">
                  {status && (
                    <Badge className={cn(
                      "rounded-md px-2 py-0.5 h-5 text-[9px] font-black uppercase tracking-widest border-none whitespace-nowrap shadow-none",
                      statusColor[status as keyof typeof statusColor]
                    )}>
                      {statusLabel[status] || status}
                    </Badge>
                  )}

                  {orderDate && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Calendar className="h-3 w-3 text-slate-300" />
                      {isEditing ? (
                        <input 
                          type="date" 
                          className="bg-transparent border-none p-0 h-4 text-slate-900 focus:ring-0 outline-none"
                          value={orderDate}
                          onChange={(e) => onUpdateDate?.(e.target.value)}
                        />
                      ) : (
                        <span>{orderDate}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
        <div className="flex gap-4 items-center">
          <div className="relative group flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all focus-within:border-brand-primary/30 focus-within:ring-4 focus-within:ring-brand-primary/5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" />
            <Input 
              className="pl-11 pr-10 h-12 border-none bg-transparent font-bold text-sm shadow-none focus-visible:ring-0 placeholder:text-slate-400 transition-all" 
              placeholder="Search products to add..." 
              value={prodQ} 
              onChange={e=>setProdQ(e.target.value)} 
              onFocus={() => prodQ.length > 0 && setShowSuggestions(true)}
            />
            {prodQ && (
              <button 
                onClick={() => {
                  setProdQ("");
                  setShowSuggestions(false);
                }}
                className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary opacity-40" />
              </div>
            )}
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-12 w-12 rounded-2xl border-slate-100 bg-white p-0 active:scale-95 transition-all shrink-0">
                <Filter className="h-4 w-4 text-slate-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("p-1 rounded-2xl shadow-2xl border border-slate-100", isCompact ? "w-[calc(100vw-2rem)] mx-4" : "w-56")} align={isCompact ? "center" : "end"}>
              <div className="p-3 border-b border-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {isCompact ? "Select Category" : "Sort Items By"}
                </span>
              </div>
              <div className="grid gap-0.5 p-1">
                {isCompact ? (
                  <div className="grid grid-cols-2 gap-1 max-h-[40vh] overflow-y-auto">
                    {categoriesListing.map((cat) => (
                      <Button 
                        key={cat}
                        variant="ghost" 
                        onClick={() => setProdCategoryFilter(cat)} 
                        className={cn(
                          "justify-center text-xs font-bold h-12 rounded-xl px-3 break-words whitespace-normal text-center", 
                          prodCategoryFilter === cat && "bg-brand-accent text-brand-primary"
                        )}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setSortBy("alphabetical")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "alphabetical" && "bg-slate-100 text-brand-primary")}>Alphabetical</Button>
                    <Button variant="ghost" onClick={() => setSortBy("margin")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "margin" && "bg-slate-100 text-brand-primary")}>High Margin First</Button>
                    <Button variant="ghost" onClick={() => setSortBy("newest")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "newest" && "bg-slate-100 text-brand-primary")}>New Products</Button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {showSuggestions && (
            <>
              <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowSuggestions(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                className="absolute left-4 right-4 top-[calc(100%-8px)] z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[360px] animate-in fade-in slide-in-from-top-2 duration-200"
              >
                {isLoading ? (
                  <div className="p-10 text-center flex flex-col items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary mb-3" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Searching Inventory</p>
                  </div>
                ) : batches.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm font-bold text-slate-900 mb-1">No products found</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black">Try a different search</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto overscroll-contain divide-y divide-slate-100">
                    <div className="px-4 py-2 bg-slate-50/50 sticky top-0 z-10 border-b border-slate-100">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suggestions</span>
                    </div>
                    {batches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="w-full p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group active:bg-slate-100 text-left"
                        onClick={() => {
                          if (b.product) {
                            handleAdd(b.product, b);
                            setProdQ("");
                            setShowSuggestions(false);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <h5 className="font-extrabold text-slate-900 text-sm leading-tight mb-1 group-hover:text-brand-primary transition-colors flex-wrap break-words">
                            {b.product?.name}
                          </h5>
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant="outline" 
                              className="h-4 border-none px-2 rounded-lg bg-orange-50 text-orange-700 text-[9px] font-black uppercase tracking-wider"
                            >
                              {b.product.unit_type === 'kg_g' || (!b.product.unit_type && ['kg', 'g', 'ml', 'ltr'].includes(b.product.pack_size_unit?.toLowerCase() || ''))
                                ? `${b.product.pack_size_value || ''}${b.product.pack_size_unit || ''}`
                                : (b.product.units_per_packet || 1) > 1 
                                  ? `${b.product.units_per_packet} Units`
                                  : (b.product.item_pack_type || "1 Case")
                              }
                            </Badge>
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter flex items-center gap-1">
                              EXP: {b.expiry_date}
                            </span>
                            <Badge variant="outline" className="h-4 border-none px-2 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black">
                              Stock: {b.remaining_qty}
                            </Badge>
                          </div>
                        </div>
                        <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-all shadow-sm">
                          <Plus size={16} className="stroke-[3]" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Category Filter Chips - Only show on desktop if we have space, moved to filter on mobile */}
        {!isCompact && (
          <div className="px-0 py-2 mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth shrink-0 px-6">
            {categoriesListing.map((cat) => (
              <button
                key={cat}
                onClick={() => setProdCategoryFilter(cat)}
                className={cn(
                  "h-9 px-5 rounded-full text-sm font-semibold transition-all duration-300 shrink-0",
                  prodCategoryFilter === cat 
                    ? "bg-brand-accent text-brand-primary shadow-sm ring-2 ring-brand-primary/10" 
                    : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900 shadow-sm"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
          <div className="space-y-8 pb-32 pr-2">

            {/* Catalog Grid */}
            {filteredBatches.length === 0 ? (
              <div className="py-24 text-center space-y-6 flex flex-col items-center justify-center min-h-[40vh]">
                <div className="h-20 w-20 rounded-2xl bg-white shadow-sm border border-border/40 flex items-center justify-center mx-auto mb-6">
                  <ShoppingBag className="h-8 w-8 text-slate-300" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    Your Order is Empty
                  </h4>
                  <p className="text-xs text-slate-500 max-w-[200px] mx-auto">Use the search bar above to find and add products to your order.</p>
                </div>
              </div>
            ) : (
              <div className="px-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{prodCategoryFilter} in Order</h3>
                  <Badge variant="outline" className="h-5 border-slate-100 text-[9px] font-bold text-slate-400">{filteredBatches.length} items</Badge>
                </div>
                <ResponsiveGrid cols={{ base: 2, sm: 2, lg: 3, xl: 4 }} gap={isCompact ? 3 : 4}>
                  {filteredBatches.map((b, bIdx) => {
                    if (!b.product) return null;
                    const stock = b.remaining_qty;
                    const isAdded = lines.some(l => l.batch_id === b.id);
                    const { price: displayPrice } = resolvePrice(b.product);
                    const quantity = lines.find(l => l.batch_id === b.id)?.quantity || 0;

                    return (
                      <motion.div
                        key={`${b.id}-${bIdx}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.98 }}
                        className="h-full"
                      >
                        <Card 
                          className={cn(
                            "group overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border border-transparent transition-all flex flex-col h-full cursor-pointer bg-white shadow-sm hover:shadow-md relative", 
                            isAdded && "bg-brand-accent/20 border-brand-primary/20",
                            stock <= 0 && "opacity-60 grayscale"
                          )} 
                          onClick={() => {
                            if (stock > 0) handleAdd(b.product!, b);
                          }}
                        >
                          <div className={cn("p-3 md:p-5 flex flex-col h-full justify-between")}>
                            <div className="flex flex-col gap-1.5 flex-1">
                               <div className="flex items-center justify-between border-b border-slate-50 pb-1.5">
                                 <Badge className="bg-slate-50 text-slate-500 border-none rounded px-1.5 py-0.5 text-[8px] font-mono font-black uppercase tracking-widest">
                                   #{b.batch_number?.slice(-8) || b.product.sku?.slice(-8)}
                                 </Badge>
                                 {(b as Batch & { isFifoPriority?: boolean }).isFifoPriority && (
                                   <div className="flex items-center gap-1">
                                      <span className="text-[7px] font-extrabold uppercase tracking-[0.2em] text-amber-600">FIFO</span>
                                   </div>
                                 )}
                               </div>
                               
                               <h4 className="font-extrabold text-slate-900 text-xs md:text-[15px] leading-tight group-hover:text-brand-primary transition-colors">
                                 {b.product.name}
                               </h4>
                               
                               <div className="flex items-center gap-2 mt-auto">
                                  <Badge 
                                     variant="outline" 
                                     className="h-4 md:h-5 border-none px-2 rounded-lg bg-emerald-50 text-emerald-600 text-[8px] md:text-[10px] font-black uppercase tracking-wider"
                                   >
                                     Stk: {b.remaining_qty}
                                   </Badge>
                               </div>

                               <div className="flex items-center gap-1.5 mt-1 opacity-60">
                                 <Calendar size={10} className="text-slate-400" />
                                 <span className="text-[7px] md:text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                   EXP: {b.expiry_date}
                                 </span>
                               </div>
                            </div>

                            <div className="flex items-center justify-between mt-3 md:mt-4 pt-3 border-t border-slate-50">
                               <div className="flex flex-col leading-none">
                                  {/* Price and status removed for cleaner layout as requested */}
                               </div>
                              
                               {isAdded ? (
                                <div className="flex items-center gap-2">
                                   <div className="flex flex-col items-end">
                                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Qty</span>
                                      <span className="text-xs md:text-sm font-black text-slate-900 tabular-nums">
                                        {quantity} {lines.find(l => l.batch_id === b.id)?.packType === 'unit' ? 'Units' : 
                                         lines.find(l => l.batch_id === b.id)?.packType === 'packet' ? 'Pkt' :
                                         lines.find(l => l.batch_id === b.id)?.packType === 'case' ? 'Case' :
                                         lines.find(l => l.batch_id === b.id)?.packType?.toUpperCase() || 'Units'}
                                      </span>
                                   </div>
                                   <div className="h-7 w-7 md:h-9 md:w-9 rounded-xl md:rounded-2xl bg-brand-primary text-white flex items-center justify-center shadow-lg shadow-brand-primary/20 active:scale-95 transition-all">
                                      <Check size={14} className="md:h-5 md:w-5 stroke-[4]" />
                                   </div>
                                </div>
                              ) : (
                                <div className="h-7 w-7 md:h-9 md:w-9 rounded-xl md:rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center border border-slate-100 group-hover:border-brand-primary group-hover:bg-brand-primary group-hover:text-white transition-all shadow-sm active:scale-95">
                                  <Plus size={14} className="md:h-5 md:w-5 stroke-[4]" />
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </ResponsiveGrid>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
