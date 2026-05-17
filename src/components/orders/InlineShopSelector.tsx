import { useState } from "react";
import { Search, Store, ChevronRight, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtINR } from "@/lib/format";
import { Shop } from "@/types";
import { AddShopDialog } from "@/components/AddShopDialog";
import { useQueryClient } from "@tanstack/react-query";

interface InlineShopSelectorProps {
  shopId: string;
  shops: Shop[];
  outstandingBalance: number;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export const InlineShopSelector = ({ 
  shopId, 
  shops, 
  outstandingBalance, 
  onSelect,
  loading 
}: InlineShopSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [shopQ, setShopQ] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const selectedShop = shops.find(s => s.id === shopId);
  const filteredShops = shops.filter(s => s.name.toLowerCase().includes(shopQ.toLowerCase()));

  const handleShopAdded = (newShopId: string) => {
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    onSelect(newShopId);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Card className="group cursor-pointer border border-border/40 hover:shadow-md transition-all rounded-2xl bg-white overflow-hidden shadow-sm h-full">
          <CardContent className="flex items-center gap-4 p-4 h-full">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-900 transition-all shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Outlet</div>
              <div className="font-bold text-base tracking-tight truncate text-slate-900">
                {loading ? "Searching..." : (selectedShop?.name ?? "Designate Customer")}
              </div>
              {selectedShop && !loading && (
                <div className="flex items-center gap-2 text-[11px] font-medium mt-1.5 text-slate-500">
                   <span className="truncate italic">GST: {selectedShop.gstin || "N/A"}</span>
                   {selectedShop.credit_limit > 0 && (
                     <span className={cn(
                       "flex items-center gap-1",
                       outstandingBalance > selectedShop.credit_limit ? "text-rose-600 font-bold" : "text-slate-400"
                     )}>
                       {fmtINR(outstandingBalance)} / {fmtINR(selectedShop.credit_limit)}
                     </span>
                   )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[90dvh] sm:h-[85vh] rounded-t-3xl p-0 overflow-hidden border-none shadow-2xl bg-slate-50">
        <div className="h-full flex flex-col">
          <div className="px-6 pt-6 pb-4 bg-white border-b border-border/40 shrink-0">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-2xl font-bold tracking-tight text-slate-900">Designate Customer</SheetTitle>
                  <p className="text-sm font-medium text-slate-400">Select an output node to initiate the sequence</p>
                </div>
                <Button 
                  onClick={() => setAddDialogOpen(true)}
                  className="h-11 rounded-xl bg-slate-900 text-white font-bold text-xs gap-2 px-6 shadow-xl shadow-slate-900/10 active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register SKU</span>
                </Button>
              </div>
            </SheetHeader>

            <AddShopDialog 
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onSuccess={handleShopAdded}
            />
            <div className="relative group">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <Input 
                className="pl-12 h-14 rounded-xl border-border/40 bg-slate-50 font-bold text-lg focus:bg-white focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:font-medium placeholder:text-slate-300" 
                placeholder="Search database..." 
                autoFocus 
                value={shopQ} 
                onChange={e=>setShopQ(e.target.value)} 
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 touch-pan-y scroll-smooth">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredShops.map((s, idx) => (
                <button 
                  key={`${s.id}-${idx}`} 
                  className="w-full rounded-2xl p-5 text-left bg-white border border-border/40 hover:border-slate-900 hover:shadow-xl transition-all flex items-center justify-between group active:scale-[0.98]" 
                  onClick={()=>{ onSelect(s.id); setOpen(false); setShopQ(""); }}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-base tracking-tight group-hover:text-slate-900 transition-colors truncate mb-1">{s.name}</div>
                    {s.gstin && <div className="text-[11px] font-medium text-slate-400 tracking-tight mb-2">GSTIN: {s.gstin}</div>}
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="text-[10px] h-5 rounded-full font-bold bg-slate-50 text-slate-500 border-none px-3 uppercase tracking-wider">{s.shop_type || "Basic"}</Badge>
                       {s.credit_limit > 0 && <span className="text-[11px] font-bold text-emerald-600">LIMIT: {fmtINR(s.credit_limit)}</span>}
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0 ml-4">
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
