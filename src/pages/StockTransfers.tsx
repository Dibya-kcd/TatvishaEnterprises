import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Plus, Search, ArrowRightLeft, Package, User, ArrowRight, History as HistoryIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/PageHeader";

type Product = {
  id: string;
  name: string;
  sku: string;
};

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  remaining_qty: number;
  expiry_date: string;
  warehouse_id?: string;
};

type TransferRecord = {
  id: string;
  product_id: string;
  from_batch_id: string;
  to_batch_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  products: Product | null;
  from_batch: { batch_number: string } | null;
  to_batch: { batch_number: string } | null;
};

import { derivePackaging, convertToBaseUnits } from "@/lib/packaging";

import { useIsMobile } from "@/lib/responsive";

export default function StockTransfers() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [search, setSearch] = useState("");
  
  // Form State
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [fromBatchId, setFromBatchId] = useState<string>("");
  const [toBatchId, setToBatchId] = useState<string>("");
  const [transferQty, setTransferQty] = useState<string>("");
  const [transferUnit, setTransferUnit] = useState<string>("unit");
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);
  const packagingInfo = useMemo(() => selectedProduct ? derivePackaging(selectedProduct) : null, [selectedProduct]);

  useEffect(() => {
    fetchTransfers();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchBatches(selectedProductId);
      setTransferUnit("unit");
    } else {
      setBatches([]);
      setFromBatchId("");
      setToBatchId("");
    }
  }, [selectedProductId]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const [transRes, prodRes, batchRes] = await Promise.all([
        supabase.from('stock_transfers').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, sku'),
        supabase.from('inventory_batches').select('id, batch_number')
      ]);

      if (transRes.error) throw transRes.error;
      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      const prodMap = new Map(prodRes.data.map(p => [p.id, p]));
      const batchMap = new Map(batchRes.data.map(b => [b.id, b]));

      const joined = (transRes.data || []).map(t => ({
        ...t,
        products: prodMap.get(t.product_id) || null,
        from_batch: batchMap.get(t.from_batch_id) || null,
        to_batch: batchMap.get(t.to_batch_id) || null
      }));

      setTransfers(joined as unknown as TransferRecord[]);
    } catch (err: unknown) {
      console.error('[Context]', err);
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
      .order('expiry_date', { ascending: true });
    setBatches(data || []);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !fromBatchId || !toBatchId || !transferQty) {
      console.error('[Context] Missing required fields for stock transfer');
      return toast.error("Please fill all required fields");
    }
    if (fromBatchId === toBatchId) {
      console.error('[Context] Source and destination batches are identical');
      return toast.error("Source and destination batches must be different");
    }

    const qty = Number(transferQty);
    let baseQty = qty;

    if (selectedProduct) {
      baseQty = convertToBaseUnits(qty, transferUnit, selectedProduct);
    }

    const fromBatch = batches.find(b => b.id === fromBatchId);
    const toBatch = batches.find(b => b.id === toBatchId);

    // Stock movement handled by DB trigger: handle_stock_transfer.
    if (fromBatch && toBatch && fromBatch.warehouse_id !== toBatch.warehouse_id) {
       console.error('[Context] Inter-batch transfer attempted between different warehouses');
       return toast.error("Inter-Batch Transfer is only for batches within the same warehouse. Use 'Warehouse Relocation' for moving stock between warehouses.");
    }

    if (fromBatch && baseQty > fromBatch.remaining_qty) {
      console.error('[Context] Insufficient stock in source batch', { available: fromBatch.remaining_qty, requested: baseQty });
      return toast.error(`Insufficient stock in source batch (Available: ${fromBatch.remaining_qty} units)`);
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('transfer_stock', {
        p_product_id: selectedProductId,
        p_from_batch_id: fromBatchId,
        p_to_batch_id: toBatchId,
        p_warehouse_id: fromBatch?.warehouse_id,
        p_quantity: baseQty,
        p_performed_by: user?.id,
        p_notes: notes
      });

      if (error) throw error;

      toast.success("Stock transferred successfully");
      setOpen(false);
      resetForm();
      fetchTransfers();
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setFromBatchId("");
    setToBatchId("");
    setTransferQty("");
    setTransferUnit("unit");
    setNotes("");
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = transfers.filter(t => 
    t.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    t.from_batch?.batch_number.toLowerCase().includes(search.toLowerCase()) ||
    t.to_batch?.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full space-y-5 pb-10 animate-fade-in px-0 sm:px-0">
      <PageHeader 
        title="Inter-Batch Transfer"
        subtitle="Moving Stock Within Warehouse"
        onBack={() => navigate("/stock")}
        action={
          <div className="flex gap-3">
            <Button variant="outline" className="font-black uppercase tracking-widest text-[10px] h-10 px-4 rounded-xl border-2 border-primary/10 text-primary hover:bg-primary/5" onClick={() => navigate("/stock/movement")}>
              <HistoryIcon className="h-3.5 w-3.5 mr-2" /> History
            </Button>
            
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="font-black uppercase tracking-widest text-[10px] h-10 px-4 rounded-xl shadow-lg shadow-primary/20" onClick={resetForm}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> New Transfer
                </Button>
              </SheetTrigger>
              <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[560px] h-full rounded-none")}>
                <div className="h-full flex flex-col bg-background">
                  <div className="p-6 pb-0">
                    {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
                    <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-black text-center">Inter-Batch Transfer</SheetTitle>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60 text-center">Internal Logistics Protocol</p>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-2 px-6 pb-24 space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Universal Identifier (Product)</Label>
                      <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger className="h-14 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Choose product..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-2 max-h-[300px]">
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id} className="font-bold">{p.name} <span className="text-[10px] text-muted-foreground ml-2 opacity-60">({p.sku})</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedProductId && (
                      <div className="grid grid-cols-1 gap-4 p-5 bg-muted/30 rounded-[2rem] border-2 border-border/50 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-brand-primary tracking-widest opacity-70 ml-1">Source Batch (From)</Label>
                          <Select value={fromBatchId} onValueChange={setFromBatchId}>
                            <SelectTrigger className="h-12 rounded-xl border-border/50 bg-white shadow-sm font-black text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick source batch..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                              {batches.filter(b => b.remaining_qty > 0).map(b => (
                                <SelectItem key={b.id} value={b.id} className="font-bold text-xs">
                                  {b.batch_number} <span className="text-[9px] opacity-60 whitespace-nowrap ml-2">(Available: {b.remaining_qty})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex justify-center -my-2 relative z-10">
                          <div className="bg-background p-2 rounded-full border-2 border-primary/20 shadow-lg text-primary animate-pulse">
                            <ArrowRightLeft className="h-5 w-5 rotate-90" />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-emerald-600 tracking-widest opacity-70 ml-1">Destination Batch (To)</Label>
                          <Select value={toBatchId} onValueChange={setToBatchId}>
                            <SelectTrigger className="h-12 rounded-xl border-border/50 bg-white shadow-sm font-black text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick target batch..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                              {batches.map(b => (
                                <SelectItem key={b.id} value={b.id} className="font-bold text-xs" disabled={b.id === fromBatchId}>
                                  {b.batch_number} {b.id === fromBatchId ? '(SOURCE)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Transfer Magnitude (Qty)</Label>
                      <div className="flex gap-2">
                        <Input 
                          type="number" 
                          className="h-14 rounded-2xl border-2 bg-muted/20 font-black text-lg focus:ring-primary/20 tabular-nums flex-1" 
                          value={transferQty} 
                          onChange={e => setTransferQty(e.target.value)}
                          placeholder="0"
                        />
                        <Select value={transferUnit} onValueChange={setTransferUnit}>
                          <SelectTrigger className="h-14 w-32 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20 capitalize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="unit">Units</SelectItem>
                            {packagingInfo?.midUnit && <SelectItem value="packet">Pack</SelectItem>}
                            <SelectItem value="case">Cases</SelectItem>
                            {packagingInfo?.allowKg && <SelectItem value="kg">Kg</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium italic ml-1 opacity-60">Specify units to migrate between batches.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Internal Reference / Notes</Label>
                      <Input 
                        className="h-14 rounded-2xl border-2 bg-muted/20 font-medium focus:ring-primary/20" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Document transfer rationale..." 
                      />
                    </div>
                  </div>

                  <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
                    <Button variant="outline" className="h-14 rounded-2xl flex-1 font-black uppercase tracking-widest text-xs border-2" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="h-14 rounded-2xl flex-[2] font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                      Confirm Pipeline Move
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <Card className="rounded-[2.5rem] border-2 shadow-xl shadow-primary/5 overflow-hidden">
        <CardHeader className="p-6 pb-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
            <Input 
              className="pl-11 h-12 rounded-2xl border-2 bg-muted/20 focus:ring-primary/20" 
              placeholder="Search transfer archives by Product, SKU or Batch..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4 overflow-x-auto">
          {isMobile ? (
            <div className="divide-y divide-border/30">
              {loading ? (
                <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs px-6">No transfer history found</div>
              ) : filtered.map(t => (
                <div key={t.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-black text-sm uppercase tracking-tight text-foreground">{t.products?.name}</div>
                      <div className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">{t.products?.sku}</div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase text-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                      <p className="text-[9px] font-mono text-muted-foreground">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-black font-mono text-muted-foreground border truncate max-w-[120px]">{t.from_batch?.batch_number}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-30" />
                      <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-black font-mono text-primary border border-primary/20 truncate max-w-[120px]">{t.to_batch?.batch_number}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <p className="text-[9px] font-bold text-muted-foreground italic truncate max-w-[180px]">{t.notes || "—"}</p>
                      <div className="text-right font-black text-lg tabular-nums text-primary">
                        {t.quantity}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/30 border-y-2 border-border/50">
                  <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px] hidden lg:table-cell">Migration Log</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entity Identifier</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center hidden xl:table-cell">Batch Migration Path</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[100px]">Moved Qty</TableHead>
                  <TableHead className="pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right hidden lg:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No transfer history found</TableCell></TableRow>
                ) : filtered.map(t => (
                  <TableRow key={t.id} className="group hover:bg-muted/10 transition-colors border-b border-border/30">
                    <TableCell className="pl-6 py-4 hidden lg:table-cell">
                      <p className="text-[10px] font-black uppercase text-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                      <p className="text-[9px] font-mono text-muted-foreground">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </TableCell>
                    <TableCell>
                      <div className="font-black text-sm uppercase tracking-tight text-foreground group-hover:text-primary transition-colors truncate">{t.products?.name}</div>
                      <div className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">{t.products?.sku}</div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                       <div className="flex items-center justify-center gap-3">
                         <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-black font-mono text-muted-foreground border truncate max-w-[100px]">{t.from_batch?.batch_number}</span>
                         <ArrowRight className="h-3 w-3 text-muted-foreground opacity-30" />
                         <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-black font-mono text-primary border border-primary/20 truncate max-w-[100px]">{t.to_batch?.batch_number}</span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right font-black text-lg tabular-nums text-primary">
                      {t.quantity}
                    </TableCell>
                    <TableCell className="pr-6 text-right hidden lg:table-cell">
                      <p className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors max-w-[180px] inline-block truncate" title={t.notes || ""}>
                        {t.notes || "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

