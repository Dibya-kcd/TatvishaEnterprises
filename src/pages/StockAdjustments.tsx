import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Plus, Search, AlertTriangle, FileText, Save, Package, Trash2, History as HistoryIcon, User, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";

import { Product } from "@/types";
import { derivePackaging, getAvailableSellUnits, convertToBaseUnits, formatStockDisplay } from "@/lib/packaging";

type AdjustmentReason = 'damage' | 'wastage' | 'sample' | 'variance' | 'return_to_supplier' | 'found_stock' | 'market_return' | 'internal_consumption' | 'expiry';

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  remaining_qty: number;
  expiry_date: string;
  products?: Product;
};

type AdjustmentRecord = {
  id: string;
  product_id: string;
  adjustment_qty: number;
  reason: string;
  notes: string | null;
  created_at: string;
  products: Product | null;
  inventory_batches: {
     batch_number: string;
  } | null;
};

export default function StockAdjustments() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [search, setSearch] = useState("");
  
  // Form State
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [adjustmentQty, setAdjustmentQty] = useState<string>("");
  const [adjustmentUnit, setAdjustmentUnit] = useState<string>("unit");
  const [reason, setReason] = useState<AdjustmentReason>('variance');
  const [varianceDirection, setVarianceDirection] = useState<'add' | 'remove'>('add');
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);
  const packagingInfo = useMemo(() => selectedProduct ? derivePackaging(selectedProduct) : null, [selectedProduct]);

  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchBatches(selectedProductId);
      setAdjustmentUnit("unit");
    } else {
      setBatches([]);
      setSelectedBatchId("");
    }
  }, [selectedProductId]);

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      // Manual join because of schema cache relationship error between 'stock_adjustments' and 'products'
      const [adjRes, prodRes, batchRes] = await Promise.all([
        supabase.from('stock_adjustments').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, sku'),
        supabase.from('inventory_batches').select('id, batch_number')
      ]);

      if (adjRes.error) throw adjRes.error;
      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      const prodMap = new Map(prodRes.data.map(p => [p.id, p]));
      const batchMap = new Map(batchRes.data.map(b => [b.id, b]));

      const joined = (adjRes.data || []).map(adj => ({
        ...adj,
        products: prodMap.get(adj.product_id) || null,
        inventory_batches: batchMap.get(adj.batch_id) || null
      }));

      setAdjustments(joined as unknown as AdjustmentRecord[]);
    } catch (err: unknown) {
      console.error('[Context] Fetch adjustments failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    setProducts(data || []);
  };

  const fetchBatches = async (productId: string) => {
    const { data } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('remaining_qty', 0)
      .order('expiry_date', { ascending: true });
    setBatches(data || []);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !selectedBatchId || !adjustmentQty) {
      console.error('[Context] Missing fields for adjustment');
      return toast.error("Please fill all required fields");
    }

    setSubmitting(true);
    try {
      // Perform conversion based on adjustmentUnit
      const qty = Math.abs(Number(adjustmentQty));
      let baseQty = qty;
      
      if (packagingInfo) {
        baseQty = convertToBaseUnits(qty, adjustmentUnit, selectedProduct!);
      }

      // Logic for negation based on reason
      const isDeduction = ['damage', 'wastage', 'sample', 'return_to_supplier'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove');
      
      const batch = batches.find(b => b.id === selectedBatchId);
      if (isDeduction && batch && baseQty > batch.remaining_qty) {
        setSubmitting(false);
        console.error('[Context] Insufficient stock for deduction', { needed: baseQty, available: batch.remaining_qty });
        return toast.error(`Insufficient stock in batch. Available: ${batch.remaining_qty}, Requested deduction: ${baseQty}`);
      }

      const finalQty = isDeduction ? -baseQty : baseQty;

      const { error } = await supabase.rpc('record_inventory_movement', {
        p_product_id: selectedProductId,
        p_batch_id: selectedBatchId,
        p_warehouse_id: batch?.warehouse_id,
        p_quantity: finalQty,
        p_movement_type: 'adjustment',
        p_reference_id: null,
        p_reference_type: 'adjustment',
        p_performed_by: user?.id,
        p_notes: `Correction: ${reason}. ${notes}`
      });

      if (error) throw error;

      toast.success("Stock adjustment recorded successfully");
      setOpen(false);
      resetForm();
      fetchAdjustments();
    } catch (err: unknown) {
      console.error('[Context] Adjustment submission failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setSelectedBatchId("");
    setAdjustmentQty("");
    setAdjustmentUnit("unit");
    setReason('variance');
    setNotes("");
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = adjustments.filter(a => 
    a.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    a.products?.sku.toLowerCase().includes(search.toLowerCase()) ||
    a.inventory_batches?.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full space-y-5 pb-10 animate-fade-in">
      <PageHeader 
        title="Stock Adjustments"
        subtitle="Record Write-offs & Variances"
        onBack={() => navigate("/stock")}
        action={
          <div className="flex gap-3">
            <Button variant="outline" className="font-black uppercase tracking-widest text-xs h-11 px-6 rounded-2xl border-2 border-primary/10 text-primary hover:bg-primary/5" onClick={() => navigate("/stock/movement?filter=adjustment")}>
              <HistoryIcon className="h-4 w-4 mr-2" /> View History
            </Button>
            
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="font-black uppercase tracking-widest text-xs h-11 px-6 rounded-2xl shadow-lg shadow-primary/20" onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" /> New Adjustment
                </Button>
              </SheetTrigger>
              <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[560px] h-full rounded-none")}>
                <div className="h-full flex flex-col bg-background">
                  <div className="p-6 pb-0">
                    {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
                    <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-black text-center">Record Stock Adjustment</SheetTitle>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60 text-center">Protocol: Inventory Correction</p>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-2 px-6 pb-24 space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Identity Product</Label>
                      <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="h-14 w-full rounded-2xl border-2 bg-muted/20 px-4 font-bold focus:ring-primary/20 outline-none">
                        <option value="">Choose product catalog item...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    </div>

                    {selectedProductId && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Specified Batch</Label>
                        <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="h-14 w-full rounded-2xl border-2 bg-muted/20 px-4 font-bold focus:ring-primary/20 outline-none">
                          <option value="">Choose active batch...</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.batch_number} (Remaining: {b.remaining_qty})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 relative">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Correction Qty</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="number" 
                            inputMode="decimal"
                            className="h-14 rounded-2xl border-2 bg-muted/20 font-black text-lg focus:ring-primary/20 tabular-nums flex-1" 
                            value={adjustmentQty} 
                            onChange={e => setAdjustmentQty(e.target.value)}
                            placeholder="0"
                          />
                          <Select value={adjustmentUnit} onValueChange={setAdjustmentUnit}>
                            <SelectTrigger className="h-14 w-32 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20 capitalize">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {selectedProduct ? getAvailableSellUnits(selectedProduct).map(u => (
                                <SelectItem key={u} value={u.toLowerCase()}>{u}</SelectItem>
                              )) : (
                                <SelectItem value="unit">Units</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {reason === 'variance' && (
                          <div className="mt-4 p-4 rounded-2xl bg-muted/20 border-2 border-border/50 flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60">Adjustment Direction</span>
                            <div className="flex items-center gap-1 bg-background p-1 rounded-xl border">
                              <Button 
                                variant={varianceDirection === 'add' ? 'default' : 'ghost'} 
                                size="sm" 
                                onClick={() => setVarianceDirection('add')}
                                className="h-8 rounded-lg text-[10px] font-black uppercase"
                              >
                                Add Stock (+)
                              </Button>
                              <Button 
                                variant={varianceDirection === 'remove' ? 'destructive' : 'ghost'} 
                                size="sm" 
                                onClick={() => setVarianceDirection('remove')}
                                className={cn("h-8 rounded-lg text-[10px] font-black uppercase", varianceDirection === 'remove' && "bg-destructive text-white")}
                              >
                                Remove Stock (-)
                              </Button>
                            </div>
                          </div>
                        )}

                        {selectedProduct && adjustmentQty && (
                          <div className="mt-2 p-2 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in zoom-in-95">
                            <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest mb-1">Impact Preview</p>
                            <p className="text-xs font-bold">
                              This will adjust stock by <span className={cn("font-black", (['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "text-destructive" : "text-emerald-600")}>
                                {(['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? '-' : '+'}
                                {convertToBaseUnits(Number(adjustmentQty), adjustmentUnit, selectedProduct)}
                              </span> base units.
                            </p>
                          </div>
                        )}
                        <div className="absolute right-36 top-[3.25rem] pointer-events-none">
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-black uppercase tracking-tighter h-5",
                            (['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "bg-destructive/10 text-destructive border-destructive/20" : 
                            adjustmentQty && Number(adjustmentQty) !== 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-muted"
                          )}>
                            {(['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "Deduct" : adjustmentQty && Number(adjustmentQty) !== 0 ? "Increment" : "Neutral"}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-right px-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-6 italic leading-tight">
                          {reason === 'variance' ? "Select direction using the toggle above." : "Quantities will be deducted automatically for chosen reason."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Classification Reason</Label>
                      <div className="flex flex-wrap gap-2 pb-2 -mx-1 px-1">
                        {[
                          { id: 'variance', label: 'Variance'},
                          { id: 'damage', label: 'Damage'},
                          { id: 'expiry', label: 'Expiry'},
                          { id: 'wastage', label: 'Wastage'},
                          { id: 'sample', label: 'Sample Out'},
                          { id: 'internal_consumption', label: 'Internal Use'},
                          { id: 'return_to_supplier', label: 'Supplier Return'},
                          { id: 'found_stock', label: 'Found Stock'},
                          { id: 'market_return', label: 'Market Return'}
                        ].map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setReason(r.id as AdjustmentReason)}
                            className={cn(
                              "h-11 rounded-xl border-2 font-bold text-[11px] uppercase tracking-tight transition-all text-center px-4",
                              reason === r.id 
                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[1.02]" 
                                : "bg-card border-border/50 text-muted-foreground hover:border-primary/20"
                            )}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Justification / Notes</Label>
                      <Input 
                        className="h-14 rounded-2xl border-2 bg-muted/20 font-medium focus:ring-primary/20" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Log detailed explanation for audit trail..." 
                      />
                    </div>
                  </div>

                  <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
                    <Button variant="outline" className="h-14 rounded-2xl flex-1 font-black uppercase tracking-widest text-xs border-2" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="h-14 rounded-2xl flex-[2] font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Finalize Adjustment
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="rounded-[2.5rem] border-2 shadow-xl shadow-primary/5 p-8 bg-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <HistoryIcon className="h-48 w-48 text-primary" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <HistoryIcon className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground">Adjustment Audit Trail</h3>
              <p className="text-sm text-muted-foreground mt-2 font-medium leading-relaxed">
                All stock adjustments are logged as immutable entries in the global movement ledger. 
                Use the ledger to track variances, write-offs, and batch corrections across the entire catalog.
              </p>
            </div>
            <Button 
              variant="default" 
              className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
              onClick={() => navigate("/stock/movement?filter=adjustment")}
            >
              Open Audit Ledger <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </Card>

        <div className="p-6 bg-amber-50/50 rounded-2xl border-2 border-amber-200/50">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 opacity-70 mb-1">Operational Protocol</p>
          <p className="text-xs font-bold text-amber-900/80 italic leading-tight">
            Adjusting stock creates an immediate inventory record that cannot be deleted. 
            Ensure all quantities are verified against physical counts before finalizing.
          </p>
        </div>
      </div>
    </div>
  );
}

