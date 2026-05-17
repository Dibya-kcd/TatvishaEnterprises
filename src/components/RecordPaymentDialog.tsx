import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { fmtINR } from "@/lib/format";

import { ResponsiveDialog } from "@/components/ui/responsive-ui";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: { id: string; invoice_number?: string };
  shopId?: string;
  shopName?: string;
  onSaved: () => void;
}

export default function RecordPaymentDialog({ open, onOpenChange, invoice, shopId, shopName, onSaved }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoice?.id || "");
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; total: number; amount_paid: number }[]>([]);

  const [allocationMode, setAllocationMode] = useState<"single" | "fifo" | "manual">("single");
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAmount("");
      setReference("");
      setMethod("cash");
      setAllocationMode(invoice?.id ? "single" : "fifo");
      setManualAllocations({});
      setPaidAt(new Date().toISOString().slice(0, 10));
      if (invoice?.id) setSelectedInvoiceId(invoice.id);
    }
  }, [open, invoice]);

  // Effect to load shop invoices if shopId is provided
  useEffect(() => {
    if (open && shopId) {
      supabase.from("invoices")
        .select(`
          id, 
          invoice_number, 
          total, 
          amount_paid, 
          shop_id,
          order:orders!invoices_order_id_fkey (shop_id)
        `)
        .neq("payment_status", "paid")
        .eq("is_void", false)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data) {
            // Filter by shopId accurately
            const shopInvoices = data.filter(inv => 
              inv.shop_id === shopId || 
              (inv.order as { shop_id: string } | null)?.shop_id === shopId
            );
            setInvoices(shopInvoices);
            if (shopInvoices.length > 0 && !selectedInvoiceId) setSelectedInvoiceId(shopInvoices[0].id);
          }
        });
    }
  }, [open, shopId, invoice, selectedInvoiceId]);

  const handleManualAllocChange = (id: string, val: string) => {
    const newAlloc = { ...manualAllocations, [id]: val };
    setManualAllocations(newAlloc);
    
    // Sum up everything to update total amount
    const total = Object.values(newAlloc).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    setAmount(total > 0 ? total.toFixed(2) : "");
  };

  const save = async () => {
    const totalAmount = Number(amount);
    if (!totalAmount || totalAmount <= 0) {
      console.error('[Context] Invalid amount for payment', { amount });
      return toast.error("Enter valid amount");
    }

    setBusy(true);
    try {
      if (allocationMode === "fifo" && invoices.length > 0) {
        // FIFO Allocation Logic
        let remaining = totalAmount;
        const paymentPayloads = [];

        for (const inv of invoices) {
          if (remaining <= 0) break;
          const outstanding = inv.total - inv.amount_paid;
          if (outstanding <= 0) continue;

          const allocation = Math.min(remaining, outstanding);
          paymentPayloads.push({
            invoice_id: inv.id,
            amount: Number(allocation.toFixed(2)),
            method: method as Database["public"]["Enums"]["payment_method"],
            reference: `FIFO: ${reference}`.trim(),
            paid_at: new Date(paidAt).toISOString()
          });
          remaining -= allocation;
        }

        if (paymentPayloads.length === 0) {
          throw new Error("No outstanding invoices found for allocation");
        }

        const { error } = await supabase.from("payments").insert(paymentPayloads);
        if (error) throw error;
      } else if (allocationMode === "manual") {
        const paymentPayloads = Object.entries(manualAllocations)
          .filter(([_, val]) => (parseFloat(val) || 0) > 0)
          .map(([invId, val]) => ({
            invoice_id: invId,
            amount: parseFloat(val),
            method: method as Database["public"]["Enums"]["payment_method"],
            reference: `Split: ${reference}`.trim(),
            paid_at: new Date(paidAt).toISOString()
          }));

        if (paymentPayloads.length === 0) {
          throw new Error("No allocations entered");
        }

        const { error } = await supabase.from("payments").insert(paymentPayloads);
        if (error) throw error;
      } else {
        // Single invoice payment
        const targetInvoiceId = invoice?.id || selectedInvoiceId;
        if (!targetInvoiceId) throw new Error("Select an invoice to pay");

        const selectedInv = invoices.find(i => i.id === targetInvoiceId) || (invoice?.id === targetInvoiceId ? invoice : null);
        if (selectedInv && 'total' in selectedInv) {
          const outstanding = (selectedInv as { total: number; amount_paid: number }).total - (selectedInv as { total: number; amount_paid: number }).amount_paid;
          if (totalAmount > outstanding + 0.01) {
             toast.error(`Amount exceeds outstanding balance of ${fmtINR(outstanding)}`);
             setBusy(false);
             return;
          }
        }

        const { error } = await supabase.from("payments").insert({
          invoice_id: targetInvoiceId,
          amount: totalAmount,
          method: method as Database["public"]["Enums"]["payment_method"],
          reference,
          paid_at: new Date(paidAt).toISOString()
        });
        if (error) throw error;
      }

      toast.success("Payment recorded");
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  const title = "Record Payment";
  const description = shopName 
    ? `Collection from ${shopName}` 
    : (invoice?.invoice_number ? `Invoice SEC-${invoice.invoice_number.slice(-4)}` : "Payment collection");

  return (
    <ResponsiveDialog 
      open={open} 
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="p-0 overflow-hidden border-0 shadow-2xl"
    >
      <div className="p-8 space-y-6">
        {!invoice && invoices.length > 0 && (
          <div className="space-y-4">
            <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
              <button 
                onClick={() => setAllocationMode("single")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "single" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                Single
              </button>
              <button 
                onClick={() => setAllocationMode("fifo")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "fifo" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                FIFO (Auto)
              </button>
              <button 
                onClick={() => setAllocationMode("manual")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "manual" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                Manual Split
              </button>
            </div>
            
            {allocationMode === "single" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Invoice</Label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black">
                    <SelectValue placeholder="Select Invoice" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {invoices.map(inv => (
                      <SelectItem key={inv.id} value={inv.id} className="font-bold py-3">
                        INV-{inv.invoice_number.slice(-4)} — Due: {fmtINR(inv.total - inv.amount_paid)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {allocationMode === "manual" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Invoice Distributions</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                  {invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-slate-900 truncate">INV-{inv.invoice_number.slice(-4)}</p>
                        <p className="text-[9px] font-bold text-slate-400">Due: {fmtINR(inv.total - inv.amount_paid)}</p>
                      </div>
                      <Input 
                        type="number"
                        placeholder="0.00"
                        className="w-24 h-9 bg-white font-black text-right rounded-lg text-xs"
                        value={manualAllocations[inv.id] || ""}
                        onChange={(e) => handleManualAllocChange(inv.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Collected Amount (₹)</Label>
            <Input 
              type="number" 
              inputMode="decimal"
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black text-2xl focus:ring-slate-900 transition-all px-6" 
              value={amount} 
              onChange={e=>setAmount(e.target.value)} 
              placeholder="0.00" 
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fulfillment Date</Label>
            <Input 
              type="date" 
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-bold px-6" 
              value={paidAt} 
              onChange={e=>setPaidAt(e.target.value)} 
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payment Instrument</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black px-6">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="cash" className="py-3 font-bold">Physical Cash</SelectItem>
              <SelectItem value="online" className="py-3 font-bold">UPI / Digital</SelectItem>
              <SelectItem value="cheque" className="py-3 font-bold">Post-dated Cheque</SelectItem>
              <SelectItem value="bank_transfer" className="py-3 font-bold">Bank Remittance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reference / Notes</Label>
          <Input 
            value={reference} 
            onChange={e=>setReference(e.target.value)} 
            placeholder="Transaction ID / Remark" 
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-medium px-6"
          />
        </div>

        <div className="pt-4 flex gap-4 md:flex-row flex-col-reverse">
          <Button 
            variant="ghost" 
            className="rounded-2xl h-14 px-8 font-black text-[10px] uppercase tracking-widest text-slate-500" 
            onClick={()=>onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            disabled={busy} 
            className="rounded-2xl h-14 px-10 bg-slate-900 border-2 border-slate-900 hover:bg-brand-primary hover:border-brand-primary transition-all shadow-xl shadow-slate-900/10 font-black text-[10px] uppercase tracking-widest flex-1"
            onClick={save}
          >
            {busy ? "Processing..." : "Record payment"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
