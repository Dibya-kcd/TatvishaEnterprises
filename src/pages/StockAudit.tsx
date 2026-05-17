import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ClipboardList, Warehouse as WarehouseIcon, ChevronRight, Calendar, User, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { StockAudit as StockAuditType, Warehouse as WarehouseType } from "@/types";
import { cn } from "@/lib/utils";

export default function StockAudit() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [audits, setAudits] = useState<(StockAuditType & { warehouses: WarehouseType })[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [open, setOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        supabase
          .from("stock_audits")
          .select("*, warehouses(name, code)")
          .order("created_at", { ascending: false }),
        supabase.from("warehouses").select("*").eq("is_active", true),
      ]);

      if (a.error) throw a.error;
      if (w.error) throw w.error;

      setAudits(a.data as unknown as (StockAuditType & { warehouses: WarehouseType })[] || []);
      setWarehouses(w.data || []);
    } catch (err: unknown) {
      console.error('[Context] Fetch audit data failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const startAudit = async () => {
    if (!selectedWarehouse) {
      console.error('[Context] Warehouse selection missing for audit');
      toast.error("Please select a warehouse");
      return;
    }

    try {
      // 1. Check if warehouse is active
      const { data: wh, error: whCheckError } = await supabase
        .from("warehouses")
        .select("is_active")
        .eq("id", selectedWarehouse)
        .single();
      
      if (whCheckError) throw whCheckError;
      if (!wh.is_active) {
        console.error('[Context] Audit attempted on inactive warehouse', selectedWarehouse);
        toast.error("Audit cannot be started for an inactive warehouse");
        return;
      }

      // 2. Create audit record
      const { data: audit, error: auditError } = await supabase
        .from("stock_audits")
        .insert({
          warehouse_id: selectedWarehouse,
          status: "draft",
          created_by: user?.id,
        })
        .select()
        .single();

      if (auditError) throw auditError;

      // 2. Fetch current stock for this warehouse
      const { data: batches, error: batchError } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("warehouse_id", selectedWarehouse)
        .gt("remaining_qty", 0);

      if (batchError) throw batchError;

      // 3. Prepare audit items
      if (batches && batches.length > 0) {
        const auditItems = batches.map((b) => ({
          audit_id: audit.id,
          product_id: b.product_id,
          batch_id: b.id,
          system_qty: b.remaining_qty,
        }));

        const { error: itemsError } = await supabase
          .from("stock_audit_items")
          .insert(auditItems);

        if (itemsError) throw itemsError;
      }

      toast.success("Audit session started");
      navigate(`/stock/audits/${audit.id}`);
    } catch (err: unknown) {
      console.error('[Context] Start audit session failed', err);
      toast.error(friendlyError(err));
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  return (
    <div className="mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-xl h-10 w-10 hover:bg-muted/10 transition-all -ml-2" 
              onClick={() => navigate("/stock")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-amber-100 rounded-lg">
              <ClipboardList className="h-5 w-5 text-amber-600" />
            </div>
            <h1 className="text-2xl font-black tracking-tight uppercase">Physical Inventory Audit</h1>
          </div>
          <p className="text-muted-foreground text-xs font-black uppercase tracking-widest opacity-60 ml-10">Verify physical stock and reconcile variances</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-12 px-6 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200">
              <Plus className="h-4 w-4 mr-2" />
              New Audit Session
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl border-2">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase">Start Audit</DialogTitle>
              <DialogDescription className="font-medium">
                Choose a warehouse to start a physical stock count.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Store Node</Label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="h-12 rounded-xl border-2 border-border/60 bg-muted/10 font-bold">
                    <SelectValue placeholder="Pick a warehouse..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-2">
                    {warehouses.map((w: WarehouseType) => (
                      <SelectItem key={w.id} value={w.id} className="font-bold">
                        {w.name} <span className="opacity-40 ml-2 font-mono text-[10px]">{w.code}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="h-11 rounded-xl font-bold">Cancel</Button>
              <Button onClick={startAudit} className="h-11 px-8 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white">Start Session</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl border-2 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-black text-[10px] uppercase tracking-widest py-4 pl-6">Created At</TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-widest">Warehouse</TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-center">Status</TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-right pr-6">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-medium italic">Loading audits...</TableCell>
              </TableRow>
            ) : audits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-medium italic">No audits recorded yet</TableCell>
              </TableRow>
            ) : (
              audits.map((a: StockAuditType & { warehouses: WarehouseType }) => (
                <TableRow key={a.id} className="cursor-pointer group hover:bg-muted/5 font-medium border-b" onClick={() => navigate(`/stock/audits/${a.id}`)}>
                  <TableCell className="py-4 pl-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{format(new Date(a.created_at), "MMM d, yyyy")}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{format(new Date(a.created_at), "HH:mm")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-brand-primary/5 rounded border border-brand-primary/10">
                        <WarehouseIcon className="h-3.5 w-3.5 text-brand-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm uppercase">{a.warehouses?.name}</span>
                        <span className="text-[10px] font-mono opacity-60">{a.warehouses?.code}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={a.status === 'completed' ? 'default' : a.status === 'draft' ? 'secondary' : 'destructive'} 
                      className={cn(
                        "rounded-md px-2 py-0.5 font-black text-[9px] uppercase tracking-widest",
                        a.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                        a.status === 'draft' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''
                      )}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button size="sm" variant="ghost" className="rounded-xl group-hover:bg-brand-primary group-hover:text-white transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Removed local cn utility as we now import it from @/lib/utils
