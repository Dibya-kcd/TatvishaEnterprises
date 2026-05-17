import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Edit2, ChevronLeft, Loader2, Save, History, FileText, CheckCircle2, XCircle, PackageCheck, AlertCircle, Trash2, ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate, fmtINR } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { autoCalcAllTiers, getPackMultiplier, type PackType, type PricingProduct, getAllocationInfo, landedCostPerLevel } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";
import { SupplierCombobox } from "@/components/stock/SupplierCombobox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type GRNStatus = 'pending' | 'approved' | 'rejected' | 'posted';

type GRN = {
  id: string;
  invoice_number: string;
  supplier_name: string | null;
  invoice_date: string;
  total_amount: number;
  total_freight?: number;
  total_handling?: number;
  notes: string | null;
  status: GRNStatus;
  created_at: string;
};

type GRNItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  pack_type: string;
  units_per_packet: number;
  packets_per_case: number;
  expiry_date: string | null;
  mfg_date: string | null;
  products: {
    name: string;
    sku: string;
    mrp: number;
    pack_size_value: number | null;
    pack_size_unit: string | null;
    unit: string | null;
  } | null;
};

export default function StockGRNs() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [search, setSearch] = useState("");
  const [editingGRN, setEditingGRN] = useState<GRN | null>(null);
  const [viewingGRN, setViewingGRN] = useState<GRN | null>(null);
  const [grnItems, setGrnItems] = useState<GRNItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<GRNStatus | 'all'>('all');

  const fetchGRNs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("*")
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setGrns((data as GRN[]) || []);
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGRNs();
  }, [fetchGRNs]);

  useEffect(() => {
    if (!viewingGRN) return;
    const fetchItems = async () => {
      setItemsLoading(true);
      try {
        const { data: items, error: itemErr } = await supabase
          .from('purchase_invoice_items')
          .select('*')
          .eq('purchase_invoice_id', viewingGRN.id);
        
        if (itemErr || !items || items.length === 0) {
          setGrnItems([]);
          return;
        }
        
        const pids = Array.from(new Set(items.map(i => i.product_id)));
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, sku, mrp, pack_size_value, pack_size_unit, unit, units_per_packet, packets_per_case')
          .in('id', pids);

        const prodMap = new Map(prods?.map(p => [p.id, p]));
        setGrnItems(items.map(i => ({
          ...i,
          products: prodMap.get(i.product_id) || null
        })) as unknown as GRNItem[]);
      } finally {
        setItemsLoading(false);
      }
    };
    fetchItems();
  }, [viewingGRN]);

  const handleAction = async (grn: GRN, action: GRNStatus) => {
    setActionLoading(true);
    try {
      // 1. Update Status
      const { error: updateErr } = await supabase
      .from('purchase_invoices')
      .update({ status: action })
      .eq('id', grn.id);
    
    if (updateErr) throw updateErr;

    // 2. Log Action
      await supabase.from('grn_approval_log').insert({
        grn_id: grn.id,
        action: action === 'posted' ? 'posted' : action === 'approved' ? 'approved' : 'rejected',
        performed_by: user?.id,
        notes: `Status changed to ${action}`
      });

      // 3. If action is 'posted', use atomic RPC from Movement Engine
      if (action === 'posted') {
        const { data: success, error: rpcErr } = await supabase.rpc('inward_purchase_invoice', {
          p_grn_id: grn.id,
          p_performed_by: user?.id
        });

        if (rpcErr || !success) throw rpcErr || new Error("Failed to post GRN atomically");
        toast.success("GRN executed and posted to inventory successfully");
      }
      toast.success(`GRN ${action.toUpperCase()} successfully`);
      fetchGRNs();
      if (viewingGRN?.id === grn.id) setViewingGRN({...grn, status: action});
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const filteredGRNs = grns.filter(g => {
    const matchesSearch = g.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (g.supplier_name || "").toLowerCase().includes(search.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return g.status === statusFilter && matchesSearch;
  });

  const handleUpdate = async () => {
    if (!editingGRN) return;
    setSaveLoading(true);
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({
          invoice_number: editingGRN.invoice_number,
          supplier_name: editingGRN.supplier_name,
          invoice_date: editingGRN.invoice_date,
          notes: editingGRN.notes
        })
        .eq("id", editingGRN.id);

      if (error) throw error;
      toast.success("GRN updated successfully");
      setEditingGRN(null);
      fetchGRNs();
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const getStatusBadge = (status: GRNStatus) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-black uppercase text-[9px] h-5 tracking-widest">Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-black uppercase text-[9px] h-5 tracking-widest">Approved</Badge>;
      case 'posted': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-black uppercase text-[9px] h-5 tracking-widest">Posted</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-black uppercase text-[9px] h-5 tracking-widest">Rejected</Badge>;
      default: return <Badge variant="outline" className="font-black uppercase text-[9px] h-5 tracking-widest">{status}</Badge>;
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  return (
    <div className="w-full space-y-5 pb-10 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-primary/10 hover:text-primary transition-all" onClick={() => navigate("/stock")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Inward GRN History</h1>
          <p className="text-xs text-muted-foreground font-black uppercase tracking-widest opacity-60">Approval & Posting Workflow</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approval', value: grns.filter(g => g.status === 'pending').length, color: 'text-amber-600' },
          { label: 'Awaiting Posting', value: grns.filter(g => g.status === 'approved').length, color: 'text-blue-600' },
          { label: 'Posted Month', value: grns.filter(g => g.status === 'posted' && g.invoice_date.startsWith(new Date().toISOString().slice(0, 7))).length, color: 'text-emerald-600' },
          { label: 'Total Volume', value: `₹${(grns.filter(g => g.status === 'posted').reduce((s, g) => s + (g.total_amount || 0), 0) / 100000).toFixed(1)}L`, color: 'text-primary' },
        ].map(s => (
          <Card key={s.label} className="p-5 rounded-[1.5rem] border-2 shadow-lg shadow-primary/5">
            <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">{s.label}</div>
            <div className={cn("text-2xl font-black mt-1", s.color)}>{loading ? '...' : s.value}</div>
          </Card>
        ))}
      </div>

        <Card className="rounded-[2.5rem] border-2 shadow-xl shadow-primary/5 overflow-hidden">
        <CardHeader className="p-6 pb-2 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
              <Input 
                className="pl-11 h-12 rounded-2xl border-2 bg-muted/20 focus:ring-primary/20" 
                placeholder="Search all manifests..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="shrink-0 h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] border-2" onClick={() => navigate("/stock/movement?filter=purchase")}>
                <History className="h-4 w-4 mr-2" /> Posting History
              </Button>
              <Button className="shrink-0 h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-brand-primary text-white" onClick={() => navigate("/stock/import")}>
                <Plus className="h-4 w-4 mr-2" /> New GRN
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {(['all', 'pending', 'approved', 'posted', 'rejected'] as const).map((t) => (
              <Button 
                key={t}
                variant={statusFilter === t ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(t)}
                className={cn(
                  "rounded-xl px-4 font-black uppercase tracking-widest text-[9px] h-8 transition-all border-2",
                  statusFilter === t 
                    ? "bg-primary text-white border-primary shadow-md shadow-primary/20 scale-[1.02]" 
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/30"
                )}
              >
                {t}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          {isMobile ? (
            <div className="space-y-3 px-4 pb-6">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse border-2" />)
              ) : filteredGRNs.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground italic text-sm border-2 border-dashed rounded-2xl">No GRNs found</div>
              ) : filteredGRNs.map(grn => (
                <div key={grn.id}
                  className="p-4 rounded-2xl border-2 border-border/60 bg-card shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                  onClick={() => setViewingGRN(grn)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm uppercase tracking-tight truncate text-primary">{grn.invoice_number}</p>
                      <p className="text-[10px] font-black uppercase text-muted-foreground truncate opacity-70">{grn.supplier_name || '—'}</p>
                    </div>
                    {getStatusBadge(grn.status)}
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Manifest Date</span>
                      <span className="text-[10px] font-bold">{fmtDate(grn.invoice_date)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60 mr-1">Valuation</span>
                      <span className="font-black text-sm text-foreground">{fmtINR(grn.total_amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-y-2 border-border/50">
                    <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px] hidden lg:table-cell">GRN Temporal</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Identifier Reference</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Supplier Source</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center hidden xl:table-cell">Status Flag</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px]">Valuation</TableHead>
                    <TableHead className="pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center w-[100px]">Control</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                  ) : filteredGRNs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No historical GRNs found</TableCell></TableRow>
                  ) : filteredGRNs.map((grn) => (
                    <TableRow key={grn.id} className="group hover:bg-muted/10 transition-colors border-b border-border/30 text-xs text-[10px] sm:text-xs">
                      <TableCell className="pl-6 py-4 hidden lg:table-cell">
                        <p className="text-[10px] font-black uppercase text-foreground">{fmtDate(grn.invoice_date)}</p>
                        <p className="text-[9px] font-mono text-muted-foreground opacity-60">Created: {new Date(grn.created_at).toLocaleDateString()}</p>
                      </TableCell>
                      <TableCell>
                        <div className="font-black font-mono text-[10px] sm:text-xs bg-muted px-2 py-1 rounded-lg border border-border/50 inline-block uppercase tracking-tight truncate max-w-full">
                          {grn.invoice_number}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-black uppercase tracking-tight text-foreground group-hover:text-primary transition-colors truncate hidden xl:table-cell">{grn.supplier_name || "—"}</TableCell>
                      <TableCell className="text-center hidden xl:table-cell">{getStatusBadge(grn.status)}</TableCell>
                      <TableCell className="text-right text-xs sm:text-sm font-black text-primary tabular-nums break-words">{fmtINR(grn.total_amount)}</TableCell>
                      <TableCell className="pr-6 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => setViewingGRN(grn)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          {(grn.status === 'pending' || grn.status === 'approved') && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => setEditingGRN(grn)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editingGRN} onOpenChange={(open) => !open && setEditingGRN(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[70dvh]" : "w-[560px] h-full rounded-none")}>
          <div className="h-full flex flex-col bg-background">
            <div className="p-6 pb-0">
              {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl font-black text-center">Edit Inward GRN</SheetTitle>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60 text-center">Protocol: Manifest Correction</p>
              </SheetHeader>
            </div>
            
            {editingGRN && (
              <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-6 max-w-xl mx-auto w-full">
                <div className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-border/50 text-[10px] space-y-1">
                  <div className="text-muted-foreground font-black uppercase tracking-widest opacity-70 flex items-center gap-2">
                    <AlertCircle className="h-3 w-3" /> System Audit ID
                  </div>
                  <div className="font-mono bg-background p-3 rounded-xl border-2 break-all text-foreground/80 font-bold">{editingGRN.id}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Ref Number</Label>
                    <Input 
                      className="h-14 rounded-2xl border-2 bg-muted/20 font-black focus:ring-primary/20"
                      value={editingGRN.invoice_number} 
                      onChange={e => setEditingGRN({...editingGRN, invoice_number: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">GRN Date</Label>
                    <Input 
                      type="date"
                      className="h-14 rounded-2xl border-2 bg-muted/20 font-black focus:ring-primary/20"
                      value={editingGRN.invoice_date} 
                      onChange={e => setEditingGRN({...editingGRN, invoice_date: e.target.value})} 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Supplier Entity</Label>
                  <SupplierCombobox 
                    value={editingGRN.supplier_name || ""} 
                    onChange={v => setEditingGRN({...editingGRN, supplier_name: v})} 
                    placeholder="Supplier Name"
                    className="h-14 border-2 bg-muted/20 font-black focus:ring-primary/20 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Internal Reference Notes</Label>
                  <Input 
                    className="h-14 rounded-2xl border-2 bg-muted/20 font-medium focus:ring-primary/20"
                    value={editingGRN.notes || ""} 
                    onChange={e => setEditingGRN({...editingGRN, notes: e.target.value})} 
                    placeholder="Log discrepancy or correction rationale..."
                  />
                </div>
              </div>
            )}

            <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
              <Button variant="outline" className="h-14 rounded-2xl flex-1 font-black uppercase tracking-widest text-xs border-2" onClick={() => setEditingGRN(null)}>Discard</Button>
              <Button className="h-14 rounded-2xl flex-[2] font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" onClick={handleUpdate} disabled={saveLoading}>
                {saveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewingGRN} onOpenChange={open => !open && setViewingGRN(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[640px] h-full rounded-none")}>
          <div className="h-full flex flex-col bg-background">
            <div className="p-6 pb-0">
              {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
              <SheetHeader className="mb-6">
                <div className="flex items-center justify-between px-2">
                  <div className="text-left">
                    <SheetTitle className="text-2xl font-black">Manifest Summary</SheetTitle>
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60">REF: {viewingGRN?.invoice_number} · {viewingGRN && fmtDate(viewingGRN.invoice_date)}</p>
                  </div>
                  {viewingGRN && getStatusBadge(viewingGRN.status)}
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-32 space-y-8">
              {viewingGRN && viewingGRN.supplier_name && (
                <div className="p-6 bg-muted/20 rounded-[2rem] border-2 border-border/50">
                  <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-70 mb-4 ml-1">Supplier Dossier</div>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white border-2 flex items-center justify-center font-black text-xl text-primary shadow-sm">
                      {viewingGRN.supplier_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-black text-lg uppercase tracking-tight leading-none">{viewingGRN.supplier_name}</div>
                      <div className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wider">{viewingGRN.notes || "No internal dossier notes available"}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-70 ml-1">Line Item Audit</div>
                <div className="border-2 rounded-[2rem] overflow-x-auto bg-white shadow-sm no-scrollbar">
                    <Table className="min-w-[700px] lg:min-w-full">
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-b-2">
                          <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Item with SKU</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center text-muted-foreground">QTY</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center text-muted-foreground">PACK</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center text-muted-foreground hidden sm:table-cell">PCS</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center text-muted-foreground hidden md:table-cell">WEIGHT</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">COST / PC</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground hidden lg:table-cell">PROFIT</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground hidden lg:table-cell">LANDED / KG</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground whitespace-nowrap hidden lg:table-cell">INV / CASE</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground pr-4">INV TOTAL</TableHead>
                          <TableHead className="pr-6 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">EXPIRY</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemsLoading ? (
                          <TableRow><TableCell colSpan={11} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto opacity-10" /></TableCell></TableRow>
                        ) : grnItems.length === 0 ? (
                          <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground italic font-medium uppercase tracking-widest text-[10px]">No line items found for this manifest</TableCell></TableRow>
                        ) : grnItems.map((item, i) => {
                          const p = item.products;
                          const qty = item.quantity || 0;
                          const cost = item.unit_cost || 0;
                          const upp = item.units_per_packet || 1;
                          const ppc = item.packets_per_case || 1;
                          const upc = upp * ppc;
                          const weightValue = Number(p?.pack_size_value) || 0;
                          const weightUnit = (p?.pack_size_unit || "g").toLowerCase();
                          const lineTotal = item.line_total || (qty * cost);
                          
                          const pricingProd: PricingProduct = {
                            id: item.product_id,
                            units_per_packet: upp,
                            packets_per_case: ppc,
                            mrp: p?.mrp || 0,
                            pack_size_value: p?.pack_size_value || 0,
                            pack_size_unit: p?.pack_size_unit || "g",
                            weight_per_unit_grams: (p?.pack_size_value && p?.pack_size_unit?.toLowerCase().startsWith('g')) ? p.pack_size_value : 0
                          };
                          
                          const multiplier = getPackMultiplier(pricingProd, item.pack_type as PackType);
                          const totalPcs = qty * multiplier;

                          const grnItemsVal = grnItems.reduce((acc, it) => acc + (it.line_total || (it.quantity * it.unit_cost)), 0);
                          const grnItemsWeight = grnItems.reduce((acc, it) => {
                            const itP = it.products;
                            const itUpp = it.units_per_packet || 1;
                            const itPpc = it.packets_per_case || 1;
                            const itMult = getPackMultiplier({ id: it.product_id, units_per_packet: itUpp, packets_per_case: itPpc, pack_size_value: itP?.pack_size_value || 0, pack_size_unit: itP?.pack_size_unit || "g" }, it.pack_type as PackType);
                            const itTotalPcs = it.quantity * itMult;
                            const itPsu = (itP?.pack_size_unit || "g").toLowerCase();
                            const itIsWeight = ['g', 'kg', 'ml', 'ltr', 'l'].some(u => itPsu.includes(u));
                            if (!itIsWeight) return acc;
                            const itWpug = (itPsu.startsWith('g') || itPsu.startsWith('m')) ? (itP?.pack_size_value || 0) : (itP?.pack_size_value || 0) * 1000;
                            return acc + (itTotalPcs * itWpug);
                          }, 0) / 1000;

                          const allocation = getAllocationInfo({
                            itemQty: qty,
                            itemUnitCost: cost,
                            itemBaseUnits: totalPcs,
                            itemWeightGrams: (p?.pack_size_value && p?.pack_size_unit?.toLowerCase().startsWith('g')) ? p.pack_size_value : (p?.pack_size_value || 0) * 1000,
                            totalFreight: viewingGRN?.total_freight || 0,
                            totalHandling: viewingGRN?.total_handling || 0,
                            totalWeightKG: grnItemsWeight,
                            totalInvoiceValue: grnItemsVal,
                            manifestLineCount: grnItems.length
                          });

                          const invoicedCostPerPack = cost;
                          const landedPerPack = invoicedCostPerPack + (allocation.freightAmount / (qty || 1)) + (allocation.handlingAmount / (qty || 1));
                          const landedPerPc = multiplier > 0 ? landedPerPack / multiplier : landedPerPack;
                          
                          const allLanded = landedCostPerLevel(pricingProd, landedPerPc, 'pcs');
                          
                          const isWeightUnit = (u: string | null | undefined) => {
                            if (!u) return false;
                            const val = u.toLowerCase();
                            return ['g', 'kg', 'gram', 'grams', 'kilogram', 'ml', 'l', 'ltr', 'liter', 'litre'].includes(val);
                          };

                          const hasWeight = (p?.pack_size_unit && p?.pack_size_value) && 
                                            (isWeightUnit(p.pack_size_unit) || (p.unit && isWeightUnit(p.unit))); 

                          const totalWeightKg = hasWeight 
                            ? weightUnit.startsWith('g') 
                              ? (totalPcs * weightValue) / 1000 
                              : (totalPcs * weightValue)
                            : 0;

                          const isCase = item.pack_type === 'case';
                          const landedPerKg = allLanded.kg;
                          const profit = p?.mrp ? (p.mrp - landedPerPc) : 0;

                          return (
                            <TableRow key={i} className="border-b last:border-0 group hover:bg-muted/5 transition-colors">
                              <TableCell className="pl-6 py-4">
                                <div className="text-xs font-black uppercase tracking-tight text-foreground group-hover:text-primary transition-colors truncate max-w-[150px] sm:max-w-xs">{p?.name || 'Unknown'}</div>
                                <div className="text-[9px] font-black font-mono text-muted-foreground opacity-60 tracking-tighter uppercase">{p?.sku || 'SKU_ORPHAN'}</div>
                              </TableCell>
                              <TableCell className="text-center font-bold text-xs">{qty}</TableCell>
                              <TableCell className="text-center font-bold text-xs uppercase opacity-60">{item.pack_type}</TableCell>
                              <TableCell className="text-center font-bold text-xs text-primary hidden sm:table-cell">{totalPcs}</TableCell>
                              <TableCell className="text-center font-bold text-xs whitespace-nowrap hidden md:table-cell">{hasWeight ? `${totalWeightKg.toFixed(2)}KG` : "—"}</TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums text-emerald-600 hidden sm:table-cell">{fmtINR(landedPerPc)}</TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums text-blue-600 hidden lg:table-cell">{fmtINR(profit)}</TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums text-amber-600 hidden lg:table-cell">{hasWeight ? fmtINR(landedPerKg) : "—"}</TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums opacity-60 hidden lg:table-cell">{fmtINR(isCase ? cost : cost * upc)}</TableCell>
                              <TableCell className="text-right text-xs font-black tabular-nums text-primary pr-4">
                                {fmtINR(qty * cost)}
                              </TableCell>
                              <TableCell className="pr-6 text-center text-[10px] font-bold text-muted-foreground opacity-60">
                                {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  <div className="p-6 bg-muted/30 border-t-2 flex items-center justify-between">
                     <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Total Manifest Valuation</span>
                     <span className="text-2xl font-black text-primary tabular-nums">{fmtINR(viewingGRN?.total_amount || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-70 ml-1">Workflow Pipeline</div>
                
                {viewingGRN?.status === 'pending' && (
                  <div className="flex gap-4 p-6 bg-muted/10 rounded-[2rem] border-2 border-dashed border-border/50 items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-tight">Pending Certification</p>
                      <p className="text-[10px] text-muted-foreground font-medium mt-1 leading-relaxed">Review manifest accuracy before approving for warehouse intake.</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        className="h-12 px-6 rounded-xl bg-orange-600 hover:bg-orange-700 font-black uppercase tracking-widest text-[10px]" 
                        onClick={() => handleAction(viewingGRN, 'approved')}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Approve
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="h-12 w-12 rounded-xl text-destructive hover:bg-destructive/10"
                        onClick={() => handleAction(viewingGRN, 'rejected')}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                )}

                {viewingGRN?.status === 'approved' && (
                  <div className="p-8 bg-blue-50/50 rounded-[2.5rem] border-2 border-blue-200/50 flex flex-col items-center text-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                      <PackageCheck className="h-40 w-40 text-blue-600" />
                    </div>
                    <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div>
                      <div className="text-blue-800 font-black text-xl uppercase tracking-tight">Certified Approved</div>
                      <p className="text-xs text-blue-600 font-medium max-w-sm mt-1 leading-relaxed opacity-80">This manifest has passed protocol check. Posting will commit units to inventory batches and sync system pricing.</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 font-black uppercase tracking-widest text-xs mt-2" 
                          disabled={actionLoading}
                        >
                          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                          Execute Pipeline Posting
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2rem] border-2 max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black uppercase tracking-tight">Confirm Pipeline Posting</AlertDialogTitle>
                          <AlertDialogDescription className="font-medium text-sm">
                            This action is IRREVERSIBLE. It will instantly increment stock levels across all line items and update product landed costs. Ensure physical goods are received before proceeding.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2">
                          <AlertDialogCancel className="rounded-xl border-2 font-black uppercase text-[10px] tracking-widest">Abort</AlertDialogCancel>
                          <AlertDialogAction 
                            className="rounded-xl bg-blue-600 hover:bg-blue-700 font-black uppercase text-[10px] tracking-widest"
                            onClick={() => handleAction(viewingGRN, 'posted')}
                          >
                            Confirm Posting
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {viewingGRN?.status === 'posted' && (
                  <div className="p-6 bg-emerald-50/50 rounded-[2.5rem] border-2 border-emerald-200/50 flex items-center gap-6 shadow-sm">
                    <div className="h-16 w-16 rounded-[1.5rem] bg-emerald-100 flex items-center justify-center shrink-0 shadow-inner">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-emerald-800 font-black text-xl uppercase tracking-tight leading-none">Protocol Complete</div>
                      <div className="text-[10px] text-emerald-700 font-black uppercase tracking-widest mt-2 opacity-70">Inventory Live · Batches Sequenced · Pricing Synced</div>
                    </div>
                  </div>
                )}

                {viewingGRN?.status === 'rejected' && (
                  <div className="p-6 bg-red-50/50 rounded-[2.5rem] border-2 border-red-200/50 flex items-center gap-6 shadow-sm opacity-60">
                    <div className="h-16 w-16 rounded-[1.5rem] bg-red-100 flex items-center justify-center shrink-0">
                      <XCircle className="h-8 w-8 text-red-600" />
                    </div>
                    <div>
                      <div className="text-red-800 font-black text-xl uppercase tracking-tight leading-none">Manifest Voided</div>
                      <p className="text-[10px] text-red-700 font-black mt-2 uppercase tracking-widest opacity-70">Rejected Status · Null Impact on Inventory</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
               <Button variant="outline" className="h-14 rounded-2xl w-full font-black uppercase tracking-widest text-xs border-2" onClick={() => setViewingGRN(null)}>Close Terminal</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

