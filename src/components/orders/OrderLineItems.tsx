import React, { useState, useMemo } from "react";
import { Minus, Plus, Trash2, BarChart3, History, Info, Sparkles, AlertTriangle, Pencil, Check, X, RefreshCw, Milestone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtINR, formatPackLabel } from "@/lib/format";
import { convertToBaseUnits, getAvailableSellUnits, getUnitLabel, formatStockDisplay } from "@/lib/packaging";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { Line, Product, Shop, NewOrderPackType } from "@/types";
import { useIsMobile } from "@/lib/responsive";
import { type PricingProduct, type PackType, calculateTierPrice, ShopType, getPackMultiplier } from "@/lib/pricing";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";

interface OrderLineItemsProps {
  lines: Line[];
  shop?: Shop;
  onRemove: (id: string, batchId?: string) => void;
  onUpdateQty: (id: string, q: number, batchId?: string) => void;
  onUpdatePackType: (id: string, pt: NewOrderPackType, batchId?: string) => void;
  onUpdatePrice: (id: string, p: number, batchId?: string) => void;
  variant?: "default" | "compact" | "inline";
}

export const OrderLineItems = ({
  lines,
  shop,
  onRemove,
  onUpdateQty,
  onUpdatePackType,
  onUpdatePrice,
  variant = "default"
}: OrderLineItemsProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string, batchId?: string) => {
    if (variant !== "default") return;
    const key = `${id}-${batchId || 'no-batch'}`;
    setExpandedId(expandedId === key ? null : key);
  };

  return (
    <div className={cn(
      "space-y-4", 
      variant === "compact" && "space-y-2",
      variant === "inline" && "space-y-3"
    )}>
      <AnimatePresence initial={false}>
        {lines.map((l, idx) => {
          const key = `${l.product_id}-${l.batch_id || 'no-batch'}`;
          const isExpanded = variant === "default" && (expandedId === key);
          const baseQty = convertToBaseUnits(l.quantity, l.packType, l as unknown as Product);
          const stockAfter = l.stock - baseQty;
          const isInsufficient = stockAfter < 0;

          return (
            <LineItemRow 
              key={`${key}-${idx}`}
              l={l}
              isExpanded={isExpanded}
              isInsufficient={isInsufficient}
              stockAfter={stockAfter}
              baseQty={baseQty}
              shop={shop}
              variant={variant}
              onToggle={() => toggleExpand(l.product_id, l.batch_id)}
              onRemove={() => onRemove(l.product_id, l.batch_id)}
              onUpdateQty={(q) => onUpdateQty(l.product_id, q, l.batch_id)}
              onUpdatePackType={(pt) => onUpdatePackType(l.product_id, pt, l.batch_id)}
              onUpdatePrice={(p) => onUpdatePrice(l.product_id, p, l.batch_id)}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
};

const LineItemRow = ({ 
  l, 
  isExpanded, 
  isInsufficient, 
  stockAfter, 
  baseQty, 
  shop, 
  variant,
  onToggle, 
  onRemove, 
  onUpdateQty, 
  onUpdatePackType, 
  onUpdatePrice 
}: {
  l: Line;
  isExpanded: boolean;
  isInsufficient: boolean;
  stockAfter: number;
  baseQty: number;
  shop?: Shop;
  variant: "default" | "compact" | "inline";
  onToggle: () => void;
  onRemove: () => void;
  onUpdateQty: (q: number) => void;
  onUpdatePackType: (pt: NewOrderPackType) => void;
  onUpdatePrice: (p: number) => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [draftPrice, setDraftPrice] = useState(l.unit_price);

  React.useEffect(() => {
    if (!isEditingPrice) setDraftPrice(l.unit_price);
  }, [l.unit_price, isEditingPrice]);

  const handlePriceSave = () => {
    onUpdatePrice(draftPrice);
    setIsEditingPrice(false);
  };

  const handlePriceCancel = () => {
    setDraftPrice(l.unit_price);
    setIsEditingPrice(false);
  };

  const isCompact = variant === "compact";
  const isInline = variant === "inline";
  const isMobile = useIsMobile();
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0], [1, 1]);
  const deleteOpacity = useTransform(x, [-100, -50], [1, 0]);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (isInline || isCompact) return;
    if (info.offset.x < -80) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsDeleting(true);
      setTimeout(onRemove, 200);
    }
  };

  const tierPrice = React.useMemo(() => {
    if (!shop?.shop_type || !l.avg_landed_cost) return null;
    return calculateTierPrice(
      l as unknown as Product, 
      shop.shop_type as ShopType, 
      l.packType as PackType, 
      l.avg_landed_cost, 
      true
    );
  }, [l, shop?.shop_type]);
  
  const validPacks = getAvailableSellUnits(l as unknown as Product);
  
  // Unit conversion hint
  const unitHint = React.useMemo(() => {
    const prod = l as unknown as Product;
    if (l.packType === 'case' && prod.case_size) {
      return `1 Case = ${prod.case_size} Pkt`;
    }
    if (l.packType === 'packet' && prod.packet_size) {
      return `1 Pkt = ${prod.packet_size} Pcs`;
    }
    return null;
  }, [l]);

  const multiplier = getPackMultiplier(l as unknown as Product, l.packType as PackType);
  const canAddMore = (l.stock || 0) >= (baseQty + multiplier);

  const realizedMargin = React.useMemo(() => {
    if (!l.avg_landed_cost || !l.unit_price) return null;
    const costPerPack = l.avg_landed_cost * multiplier;
    return ((l.unit_price - costPerPack) / l.unit_price) * 100;
  }, [l.unit_price, l.avg_landed_cost, multiplier]);

  if (isInline) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm relative group"
      >
        <button 
          onClick={onRemove}
          className="absolute -top-2 -right-2 h-6 w-6 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 shadow-sm active:scale-95 transition-all z-10"
        >
          <Trash2 size={12} />
        </button>

        <div className="flex flex-col gap-3">
          {/* TOP ROW: [name + info] [price] */}
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-medium text-slate-900 leading-snug">
                {l.name}
              </h4>
              <p className="text-[10px] text-slate-400 font-medium">
                {l.pack_size_value}{l.pack_size_unit}
              </p>
            </div>
            <div className="text-right shrink-0">
               <p className="text-[14px] font-bold text-slate-900 leading-tight tabular-nums">
                 {fmtINR(l.unit_price)}
               </p>
            </div>
          </div>

          {/* MIDDLE ROW: Batch Pill + Cost/Margin */}
          <div className="flex flex-wrap gap-2 items-center">
            {l.batch_number && (
              <div className="bg-[#fdf0e6] text-[#c2410c] px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5">
                {l.is_fifo && <Milestone size={10} className="text-orange-600" />}
                <span className="truncate max-w-[120px]">Batch: {l.batch_number.slice(-8)}</span>
              </div>
            )}
            
            {l.avg_landed_cost && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">
                  Cost: {fmtINR(l.avg_landed_cost * multiplier)}
                </span>
                {realizedMargin !== null && (
                  <Badge className={cn(
                    "text-[8px] font-black h-4 px-1.5 border-none",
                    realizedMargin > 15 ? "bg-emerald-100 text-emerald-700" : realizedMargin > 5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                  )}>
                    {realizedMargin.toFixed(1)}% MGN
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM ROW: [pill buttons] [qty stepper] */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1">
              {(['pcs', 'packet', 'case'] as const).map(pt => {
                const available = validPacks.some(v => v.toLowerCase().startsWith(pt.substring(0, 2)));
                if (!available && pt !== 'pcs') return null; // Always show pcs or if valid
                
                const isActive = l.packType === pt;
                const labels = { pcs: "Pcs", packet: "Pkt", case: "Case" };

                return (
                  <button
                    key={pt}
                    onClick={() => onUpdatePackType(pt as NewOrderPackType)}
                    className={cn(
                      "px-3 h-8 rounded-full text-[11px] font-bold transition-all border",
                      isActive 
                        ? "bg-[#c2410c] text-white border-[#c2410c]" 
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {labels[pt]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button 
                onClick={() => onUpdateQty(Math.max(1, l.quantity - 1))}
                className="h-7 w-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95"
              >
                <Minus size={12} />
              </button>
              <input 
                type="number"
                value={l.quantity}
                onChange={e => onUpdateQty(Number(e.target.value) || 0)}
                className="w-10 text-center bg-transparent text-[13px] font-bold focus:outline-none tabular-nums"
              />
              <button 
                disabled={!canAddMore}
                onClick={() => onUpdateQty(l.quantity + 1)}
                className="h-7 w-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 disabled:opacity-30"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* FOOTER: unit hint + SKU */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400">
              {unitHint || `1 ${formatPackLabel(l.packType)} = ${multiplier} units`}
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              SKU: {l.sku}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDeleting ? 0 : 1, scale: isDeleting ? 0.9 : 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "relative group bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-border/40 shadow-sm transition-all",
        (isCompact || isMobile) ? "p-2.5 sm:p-3" : "p-4"
      )}
    >
      {/* Delete Background */}
      <div className="absolute inset-0 bg-rose-500 flex items-center justify-end px-8">
        <motion.div style={{ opacity: deleteOpacity }} className="flex items-center gap-2 text-white font-bold text-[10px] uppercase tracking-wider transition-all">
          <Trash2 className="h-4 w-4" />
          <span>Remove</span>
        </motion.div>
      </div>

      <motion.div
        drag={(isCompact || isMobile) ? false : "x"}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x, opacity }}
        className={cn(
          "relative bg-white flex flex-col transition-all",
          (isCompact || isMobile) ? "gap-1.5" : "gap-3"
        )}
      >
        {/* TOP ROW: Name + Info | Price */}
        <div className={cn("flex items-start gap-3 min-w-0 px-0.5", l.isRemoved && "grayscale opacity-50")}>
          <div className="flex-1 min-w-0 flex flex-col pt-0">
            <h4 className={cn(
              "text-[13px] sm:text-[14px] font-bold text-slate-900 leading-tight flex items-center gap-1.5",
              l.isRemoved && "line-through text-slate-400"
            )}>
              {l.isNew && <Badge className="h-3.5 px-1 text-[7px] bg-[#c2410c] text-white border-none shrink-0 font-black">+NEW</Badge>}
              <span className="whitespace-normal overflow-visible">{l.name}</span>
            </h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <div className="flex items-center gap-1.5 shrink-0">
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  {l.pack_size_value}{l.pack_size_unit}
                </p>
                {l.batch_number && (
                  <Badge variant="outline" className="h-4 p-0 px-1.5 text-[7px] sm:text-[8px] bg-amber-50 border-amber-200/50 text-amber-700 font-black shrink-0">
                    #{l.batch_number.slice(-6)}
                  </Badge>
                )}
              </div>

              {l.avg_landed_cost && (
                <div className="flex items-center gap-3 border-l border-slate-100 pl-3">
                  <div className="flex flex-col">
                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest leading-none">Line Cost</span>
                    <span className="text-[9px] font-bold text-slate-500 tabular-nums">{fmtINR(l.avg_landed_cost * multiplier)}</span>
                  </div>
                  
                  {realizedMargin !== null && (
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest leading-none">Margin</span>
                      <span className={cn(
                        "text-[9px] font-black tabular-nums",
                        realizedMargin > 15 ? "text-emerald-600" : realizedMargin > 5 ? "text-amber-600" : "text-rose-600"
                      )}>
                        {realizedMargin.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            {isEditingPrice ? (
              <div className="flex flex-col gap-1.5 items-end">
                <div className="flex items-center gap-1">
                  <Input 
                    type="number" 
                    autoFocus
                    className="h-8 w-24 text-right font-bold text-sm bg-slate-50 border-slate-200" 
                    value={draftPrice} 
                    onChange={e => setDraftPrice(Number(e.target.value))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handlePriceSave();
                      if (e.key === 'Escape') handlePriceCancel();
                    }}
                  />
                  <div className="flex items-center">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={handlePriceSave}>
                      <Check size={14} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={handlePriceCancel}>
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end">
                <div 
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer group/price" 
                  onClick={() => setIsEditingPrice(true)}
                >
                  <Pencil size={10} className="text-slate-300 opacity-40 group-hover/price:text-brand-primary transition-all" />
                  <p className="text-[14px] font-bold text-slate-900 leading-tight tabular-nums group-hover/price:text-brand-primary transition-all">
                    {fmtINR(l.unit_price)}
                  </p>
                </div>
                {l.isModified && !l.isNew && <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest mt-0.5 bg-amber-50 px-1 rounded">Price Modified</span>}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE ROW: Batch Pill (Condensed) */}
        <div className="flex flex-wrap gap-2 items-center">
          {l.batch_number && (
            <div className="bg-[#fdf0e6] text-[#c2410c] px-2.5 py-0.5 rounded-md text-[9px] font-bold flex items-center gap-1.5 border border-orange-100">
              {l.is_fifo && <Milestone size={9} className="text-orange-600" />}
              <span className="truncate max-w-[180px]">Batch: {l.batch_number}</span>
            </div>
          )}
        </div>
        
        {isInsufficient && (
          <div className="flex items-center gap-2 bg-rose-50 text-rose-600 px-2 py-1 rounded-lg text-[9px] sm:text-xs font-black w-full uppercase">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Shortage: {formatStockDisplay(l.stock, l as unknown as Product)} left</span>
          </div>
        )}

        {/* BOTTOM ROW: Pack Pill Selectors | Qty Stepper */}
        <div className={cn("flex items-center justify-between gap-3 mt-0.5", l.isRemoved && "grayscale pointer-events-none")}>
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
            {(['pcs', 'packet', 'case'] as const).map(pt => {
                const available = validPacks.some(v => v.toLowerCase().startsWith(pt.substring(0, 2)));
                if (!available && pt !== 'pcs') return null; 
                
                const isActive = l.packType === pt;
                const labels = { pcs: "Pcs", packet: "Pkt", case: "Case" };

                return (
                  <button
                    key={pt}
                    onClick={() => onUpdatePackType(pt as NewOrderPackType)}
                    className={cn(
                      "px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0",
                      isActive 
                        ? "bg-[#c2410c] text-white border-[#c2410c] shadow-sm" 
                        : "bg-white text-slate-400 border-slate-100 hover:bg-slate-50"
                    )}
                  >
                    {labels[pt]}
                  </button>
                );
            })}
          </div>

          <div className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-100 scale-90 sm:scale-100 origin-right">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 rounded-md bg-white shadow-sm border border-slate-100 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all p-0"
              onClick={() => onUpdateQty(Math.max(1, l.quantity - 1))}
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <input 
              className="w-8 text-center bg-transparent font-black text-[11px] sm:text-[13px] p-0 focus:outline-none tabular-nums text-slate-900" 
              type="number"
              value={l.quantity}
              onChange={e => onUpdateQty(Number(e.target.value) || 0)}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              disabled={!canAddMore}
              className="h-7 w-7 rounded-md bg-white shadow-sm border border-slate-100 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all p-0 disabled:opacity-30"
              onClick={() => onUpdateQty(l.quantity + 1)}
            >
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>

        {/* Removed Overlay / Undo Button */}
        {l.isRemoved && (
          <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] z-10">
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-full bg-slate-900 text-white border-slate-900 hover:bg-slate-800 h-8 px-4 font-bold text-[10px] uppercase tracking-wider gap-2 shadow-lg"
               onClick={() => onUpdateQty(l.quantity)} // This will trigger the reactivate logic in useOrderDraft if I set it up specifically, or I can just use a separate 'Restore' prop
             >
               <RefreshCw className="h-3 w-3" />
               Restore Item
             </Button>
          </div>
        )}

        {/* FOOTER: Unit Hint */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-2 border-t border-slate-50">
          <div className="flex items-center gap-2 italic opacity-80">
            <span>{unitHint || `1 ${formatPackLabel(l.packType)} = ${multiplier} units`}</span>
          </div>
          {/* Removed SKU as requested */}
        </div>

      </motion.div>
    </motion.div>
  );
};
