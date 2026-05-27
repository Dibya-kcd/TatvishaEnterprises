import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtINR } from "@/lib/format";
import { Shop, Line } from "@/types";
import { Loader2, Save, Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderSummaryCardProps {
  lines: Line[];
  totals: { subtotal: number; gst: number; total: number; calculatedDiscount: number };
  shop?: Shop;
  outstandingBalance: number;
  discountType: "percentage" | "fixed";
  setDiscountType: (t: "percentage" | "fixed") => void;
  discountAmount: number;
  setDiscountAmount: (a: number) => void;
  notes: string;
  setNotes: (n: string) => void;
  onAction: (status: "draft" | "pending_approval") => void;
  busy: boolean;
  isAdmin: boolean;
  onUpdateShop: (fields: Partial<Shop>) => void;
}

export function OrderSummaryCard({
  lines,
  totals,
  shop,
  outstandingBalance,
  discountType,
  setDiscountType,
  discountAmount,
  setDiscountAmount,
  notes,
  setNotes,
  onAction,
  busy,
  isAdmin,
}: OrderSummaryCardProps) {
  const activeLines = lines.filter(l => !l.isRemoved);

  return (
    <Card className="rounded-[2rem] border-slate-100 shadow-xl overflow-hidden bg-white">
      <CardContent className="p-0">
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Order Summary</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {activeLines.length} products listed
            </p>
          </div>

          <div className="space-y-3 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
            <div className="flex justify-between items-center text-sm font-medium text-slate-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmtINR(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-medium text-slate-500">
              <span>GST Total</span>
              <span className="tabular-nums">{fmtINR(totals.gst)}</span>
            </div>
            
            <div className="py-2 border-y border-dashed border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Discount Type</Label>
                <Select value={discountType} onValueChange={(v: "percentage" | "fixed") => setDiscountType(v)}>
                  <SelectTrigger className="h-8 w-28 rounded-lg bg-white font-bold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="fixed" className="text-xs font-bold">Fixed Amount</SelectItem>
                    <SelectItem value="percentage" className="text-xs font-bold">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Value</Label>
                <div className="relative w-28">
                  <Input 
                    type="number" 
                    value={discountAmount} 
                    onChange={e => setDiscountAmount(Number(e.target.value))}
                    className="h-8 rounded-lg font-bold text-xs bg-white text-right pr-6" 
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    {discountType === 'percentage' ? '%' : '₹'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-lg font-black text-slate-900">Total Payable</span>
              <span className="text-2xl font-black text-[#c2410c] tabular-nums">{fmtINR(totals.total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Additional Notes</Label>
            <Textarea 
              placeholder="Internal directives or customer instructions..."
              className="min-h-[80px] rounded-2xl bg-slate-50/50 border-slate-100 placeholder:text-slate-300 font-medium text-sm focus:bg-white transition-all"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="h-14 rounded-2xl font-bold bg-white border-slate-200 text-slate-600 gap-2 hover:bg-slate-100 transition-all active:scale-95"
            onClick={() => onAction("draft")}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </Button>
          <Button 
            className="h-14 rounded-2xl font-bold bg-slate-900 text-white gap-2 hover:bg-slate-800 transition-all active:scale-95 px-4"
            onClick={() => onAction("pending_approval")}
            disabled={busy || activeLines.length === 0}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={18} className="stroke-[3]" />}
            <span className="truncate">Submit for Approval</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
