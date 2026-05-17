import { toast } from "sonner";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, X, Loader2, Filter, ShoppingBag, Check, Sparkles, Calendar, ChevronRight, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtINR, formatDivisionCategory } from "@/lib/format";
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
  shop
}: ProductCatalogProps) => {
  const isCompact = useIsCompact();
  const [prodQ, setProdQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [prodCategoryFilter, setProdCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"margin" | "newest" | "alphabetical">("alphabetical");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(prodQ), 300);
    return () => clearTimeout(timer);
  }, [prodQ]);

  const {
    data: batchData,
    isLoading: isBatchesLoading
  } = useRecommendedBatches(warehouseId, debouncedQ, !!warehouseId && warehouseId !== "null");

  const isLoading = isBatchesLoading;

  const batches = useMemo(() => {
    return batchData?.pages.flatMap(page => page.data) ?? [];
  }, [batchData]);

  const categoriesListing = useMemo(() => {
    const cats = new Set<string>();
    batches.forEach(b => {
      if (b.product?.division_category) cats.add(formatDivisionCategory(b.product.division_category));
    });
    return ["All", ...Array.from(cats)].sort();
  }, [batches]);

  const filteredBatches = useMemo(() => {
    let filtered = batches;
    if (prodCategoryFilter !== "All") {
      filtered = filtered.filter(b => b.product && formatDivisionCategory(b.product.division_category) === prodCategoryFilter);
    }
    
    // Auto-identify FIFO priority per product within the filtered set
    const productFirstBatchMap = new Map<string, string>();
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.expiry_date || '9999-12-31').getTime();
      const dateB = new Date(b.expiry_date || '9999-12-31').getTime();
      return dateA - dateB;
    });

    sorted.forEach(b => {
      if (b.product_id && !productFirstBatchMap.has(b.product_id)) {
        productFirstBatchMap.set(b.product_id, b.id);
      }
    });

    // Performance optimization: Limit displayed batches to prevent DOM bloat during search
    return sorted.map(b => ({
      ...b,
      isFifoPriority: productFirstBatchMap.get(b.product_id || '') === b.id
    })).slice(0, 48); // Render at most 48 items at once to keep interactions snappy
  }, [batches, prodCategoryFilter]);

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
    <div className={cn("h-full flex flex-col relative overflow-hidden bg-slate-50/50", className)}>
      {/* Header Area */}
      <div className={cn("px-6 py-1 shrink-0 flex items-center justify-between")}>
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
      <div className={cn("px-6 py-4 bg-transparent shrink-0")}>
        <div className="flex gap-4 items-center">
          <div className="relative group flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all focus-within:border-brand-primary/30 focus-within:ring-4 focus-within:ring-brand-primary/5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" />
            <Input 
              className="pl-11 h-12 border-none bg-transparent font-bold text-sm shadow-none focus-visible:ring-0 placeholder:text-slate-400 transition-all" 
              placeholder="Search stock by product or batch..." 
              value={prodQ} 
              onChange={e=>setProdQ(e.target.value)} 
            />
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
            <PopoverContent className="w-56 p-1 rounded-2xl shadow-2xl border border-slate-100" align="end">
              <div className="p-3 border-b border-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sort Items By</span>
              </div>
              <div className="grid gap-0.5 p-1">
                <Button variant="ghost" onClick={() => setSortBy("alphabetical")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "alphabetical" && "bg-slate-100 text-brand-primary")}>Alphabetical</Button>
                <Button variant="ghost" onClick={() => setSortBy("margin")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "margin" && "bg-slate-100 text-brand-primary")}>High Margin First</Button>
                <Button variant="ghost" onClick={() => setSortBy("newest")} className={cn("justify-start text-xs font-bold h-10 rounded-xl px-3", sortBy === "newest" && "bg-slate-100 text-brand-primary")}>New Products</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Category Filter Chips */}
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="space-y-8 pb-32">
            {/* Added Items Preview / Editing Banner */}
            {lines.length > 0 && (
              <div className="px-6 py-2 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className={cn(
                  "bg-white rounded-3xl border border-slate-100 p-4 shadow-sm transition-all",
                  isEditing ? "ring-2 ring-amber-500/20 border-amber-100" : "ring-4 ring-brand-primary/5"
                )}>
                  {isEditing ? (
                    <div className="flex flex-col gap-3">
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mb-3 text-brand-primary">
                      <div className="flex flex-col">
                         <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                           Added to this order
                         </span>
                         <span className="text-[9px] font-medium text-slate-400 italic">
                           Resume adding or swipe to review
                         </span>
                      </div>
                      {onViewReview && (
                        <Button variant="ghost" onClick={onViewReview} className="h-7 px-3 text-[10px] font-bold text-brand-primary uppercase tracking-wider hover:bg-brand-primary/5 rounded-full border border-brand-primary/10">
                           Review {lines.length} items
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {isEditing ? (
                    <OrderLineItems 
                      variant="inline"
                      lines={lines}
                      shop={shop}
                      onRemove={onRemove}
                      onUpdateQty={onUpdateQty}
                      onUpdatePackType={onUpdatePackType}
                      onUpdatePrice={onUpdatePrice}
                    />
                  ) : (
                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                      {lines.map((l, i) => (
                        <div 
                          key={`${l.product_id}-${l.batch_id}-${i}`}
                          className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full pl-1 pr-3 py-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                          onClick={onViewReview}
                        >
                           <div className="h-6 w-6 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center">
                              {l.quantity}
                           </div>
                           <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]">{l.name}</span>
                           {l.batch_number && <Badge variant="outline" className="h-4 p-0 px-1 text-[8px] bg-white border-slate-200">#{l.batch_number}</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Catalog Grid */}
            {filteredBatches.length === 0 ? (
              <div className="py-24 text-center space-y-6 flex flex-col items-center justify-center min-h-[40vh]">
                <div className="h-20 w-20 rounded-2xl bg-white shadow-sm border border-border/40 flex items-center justify-center mx-auto mb-6">
                  <ShoppingBag className="h-8 w-8 text-slate-300" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    {isLoading ? "Loading Stock..." : "No Stock Detected"}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-[200px] mx-auto">Try adjusting your filters or search query to find products.</p>
                </div>
              </div>
            ) : (
              <div className="px-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{prodCategoryFilter} Inventory</h3>
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
                      >
                        <Card 
                          className={cn(
                            "group overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border border-transparent transition-all flex flex-col min-h-[120px] md:min-h-[140px] cursor-pointer bg-white shadow-sm hover:shadow-md relative", 
                            isAdded && "bg-brand-accent/20 border-brand-primary/20",
                            stock <= 0 && "opacity-60 grayscale"
                          )} 
                          onClick={() => {
                            if (stock > 0) handleAdd(b.product!, b);
                          }}
                        >
                          <div className={cn("p-2.5 md:p-4 flex flex-col h-full justify-between")}>
                            <div>
                               <div className="flex items-center justify-between mb-1.5 md:mb-2 border-b border-slate-50 pb-1">
                                 <Badge className="bg-slate-50 text-slate-500 border-none rounded px-1 py-0 text-[8px] font-mono font-black">
                                   #{b.batch_number?.slice(-8)}
                                 </Badge>
                                 {(b as Batch & { isFifoPriority?: boolean }).isFifoPriority && (
                                   <div className="flex items-center gap-1">
                                      <span className="text-[7px] font-black uppercase tracking-widest text-amber-600">FIFO</span>
                                   </div>
                                 )}
                               </div>
                               
                               <h4 className="font-bold text-slate-900 text-xs md:text-[14px] leading-[1.1] mb-1 group-hover:text-brand-primary transition-colors line-clamp-3">
                                 {b.product.name}
                               </h4>
                               
                               <div className="flex items-center gap-2 mt-0.5">
                                 <span className="text-[7px] md:text-[9px] font-black text-amber-600 uppercase tracking-tighter">
                                   EXP: {b.expiry_date}
                                 </span>
                                 <Badge 
                                    variant="outline" 
                                    className="h-3.5 md:h-4 border-none px-1 rounded bg-emerald-50 text-emerald-600 text-[7px] md:text-[9px] font-black"
                                  >
                                    Stk: {b.remaining_qty}
                                  </Badge>
                               </div>
                            </div>

                            <div className="flex items-center justify-between mt-2 md:mt-3">
                               <div className="flex flex-col leading-none">
                                  <span className="text-xs md:text-base font-black text-slate-900 tabular-nums">{fmtINR(displayPrice)}</span>
                               </div>
                              
                               {isAdded ? (
                                <div className="flex items-center gap-1.5 md:gap-2">
                                   <span className="text-[10px] md:text-xs font-black text-slate-900">{quantity}</span>
                                   <div className="h-6 w-6 md:h-8 md:w-8 rounded-lg md:rounded-xl bg-brand-primary text-white flex items-center justify-center shadow-lg shadow-brand-primary/10">
                                      <Check size={12} className="md:h-4 md:w-4 stroke-[3]" />
                                   </div>
                                </div>
                              ) : (
                                <div className="h-6 w-6 md:h-8 md:w-8 rounded-lg md:rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center border border-slate-100 group-hover:border-brand-primary group-hover:bg-brand-primary group-hover:text-white transition-all shadow-sm">
                                  <Plus size={12} className="md:h-4 md:w-4 stroke-[3]" />
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
