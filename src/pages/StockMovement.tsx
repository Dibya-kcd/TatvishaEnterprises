import { useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowUpRight, ArrowDownRight, ArrowRightLeft, MoreVertical } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { Product } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { downloadCSV } from "@/lib/exportUtils";
import { Download } from "lucide-react";
import * as React from "react";

type LedgerEntry = {
  id: string;
  product_id: string;
  batch_number: string | null;
  qty_transacted: number;
  entry_type: string;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
  product_name: string;
  product_sku: string;
  units_per_packet: number;
  packets_per_case: number;
  order_number: string | null;
  shop_name: string | null;
  shop_location: string | null;
  purchase_invoice_number: string | null;
  supplier_name: string | null;
  from_warehouse_name: string | null;
  to_warehouse_name: string | null;
  created_by_name: string | null;
};

export default function StockMovement() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get("filter") || "all");
  const parentRef = React.useRef<HTMLDivElement>(null);

  const pageSize = 50;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery({
    queryKey: ["stock-movement", typeFilter, search],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('v_stock_ledger_details')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (typeFilter !== "all") {
        query = query.eq('entry_type', typeFilter);
      }

      if (search) {
        query = query.or(`product_name.ilike.%${search}%,product_sku.ilike.%${search}%,batch_number.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { data: data as LedgerEntry[], page: pageParam };
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.data.length === pageSize ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 0,
    staleTime: 60000,
  });

  const allEntries = useMemo(() => {
    return data?.pages.flatMap(p => p.data) || [];
  }, [data]);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allEntries.length + 1 : allEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  React.useEffect(() => {
    if (!lastItem) return;

    if (
      lastItem.index >= allEntries.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, allEntries.length, isFetchingNextPage, lastItem]);

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const getEntryBadge = (type: string) => {
    switch (type) {
      case 'purchase': return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">PURCHASE</Badge>;
      case 'dispatch': return <Badge className="bg-blue-100 text-blue-700 border-blue-200">DISPATCH</Badge>;
      case 'adjustment': return <Badge className="bg-amber-100 text-amber-700 border-amber-200">ADJUSTMENT</Badge>;
      case 'reversal': return <Badge className="bg-purple-100 text-purple-700 border-purple-200">REVERSAL</Badge>;
      default: return <Badge variant="outline">{type.toUpperCase()}</Badge>;
    }
  };

  return (
    <div className="w-full h-screen flex flex-col space-y-5 pb-10 animate-fade-in overflow-hidden">
      <div className="px-4 pt-4 shrink-0">
        <PageHeader 
          title="Stock activity ledger"
          subtitle="Complete Transactional Audit Trail"
          onBack={() => navigate("/stock")}
        />

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
            <Input 
              className="pl-11 h-11 rounded-xl border bg-muted/5 focus:bg-background transition-all" 
              placeholder="Search by Product, SKU or Batch..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 pb-2 -mx-1 px-1 flex-1">
            {['all', 'purchase', 'dispatch', 'adjustment', 'reversal'].map(t => (
              <Button 
                key={t}
                variant={typeFilter === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "rounded-xl px-5 font-bold text-[11px] uppercase tracking-widest h-10 transition-all border-2",
                  typeFilter === t 
                    ? "bg-primary text-white border-primary shadow-md shadow-primary/20 scale-[1.02]" 
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/30"
                )}
              >
                {t}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl px-5 h-10 border-2 font-black text-[11px] uppercase tracking-widest gap-2 bg-white"
            onClick={() => {
              if (allEntries.length === 0) return;
              const exportData = allEntries.map(e => ({
                Date: new Date(e.created_at).toLocaleDateString(),
                Time: new Date(e.created_at).toLocaleTimeString(),
                Product: e.product_name,
                SKU: e.product_sku,
                Type: e.entry_type.toUpperCase(),
                Quantity: e.qty_transacted,
                Shop: e.shop_name || '-',
                Supplier: e.supplier_name || '-',
                Batch: e.batch_number || '-',
                User: e.created_by_name || 'SYSTEM',
                Notes: e.notes || ''
              }));
              downloadCSV(exportData, `Stock_Movement_${typeFilter}_${new Date().toISOString().split('T')[0]}`);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4">
        <Card className="h-full rounded-2xl border border-border/60 shadow-sm overflow-hidden flex flex-col">
          <div 
            ref={parentRef}
            className="flex-1 overflow-auto bg-white scroll-smooth"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualItem) => {
                const isLoaderRow = virtualItem.index > allEntries.length - 1;
                const entry = allEntries[virtualItem.index];

                if (isLoaderRow) {
                  return (
                    <div
                      key="loader"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      className="flex items-center justify-center py-4"
                    >
                      {isFetchingNextPage ? <Loader2 className="h-6 w-6 animate-spin text-primary opacity-50" /> : null}
                    </div>
                  );
                }

                if (!entry) return null;

                return (
                  <div
                    key={entry.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="border-b border-border/30 hover:bg-slate-50/50 transition-all p-4 flex flex-col md:flex-row gap-4"
                  >
                    {/* Mobile optimized view inside virtualized row */}
                    <div className="flex-1 flex flex-col md:flex-row gap-4">
                      <div className="w-[120px] shrink-0">
                        <p className="text-[10px] font-black uppercase text-foreground">{fmtDate(entry.created_at)}</p>
                        <p className="text-[9px] font-mono text-muted-foreground">{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm uppercase tracking-tight text-foreground truncate">{entry.product_name}</div>
                        <div className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">{entry.product_sku}</div>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {entry.shop_name && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="h-4 px-1.5 text-[8px] font-black bg-primary/10 text-primary border-none">SHOP</Badge>
                              <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]">{entry.shop_name}</span>
                            </div>
                          )}
                          {entry.batch_number && (
                            <Badge variant="outline" className="font-mono text-[9px] h-4 px-1.5 uppercase tracking-tighter">{entry.batch_number}</Badge>
                          )}
                          {getEntryBadge(entry.entry_type)}
                        </div>
                      </div>

                      <div className="w-[120px] text-right shrink-0">
                        <div className={cn(
                          "font-black text-lg tabular-nums leading-none",
                          entry.qty_transacted > 0 ? "text-emerald-600" : "text-destructive"
                        )}>
                          {entry.qty_transacted > 0 ? '+' : ''}{entry.qty_transacted}
                        </div>
                        <StockBreakdownDisplay 
                          stockBaseUnits={entry.qty_transacted} 
                          product={{
                            id: entry.product_id,
                            name: entry.product_name,
                            units_per_packet: entry.units_per_packet,
                            packets_per_case: entry.packets_per_case
                          } as unknown as Product} 
                          variant="compact" 
                          className="text-[9px] opacity-60 font-bold"
                        />
                      </div>

                      <div className="hidden md:block w-[180px] text-right shrink-0">
                        <p className="text-[10px] font-bold text-foreground">
                          {entry.created_by_name || "SYSTEM"}
                        </p>
                        <p className="text-[10px] text-muted-foreground italic truncate">
                          {entry.notes || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {allEntries.length === 0 && !isLoading && (
              <div className="py-20 text-center text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No records found</div>
            )}
            
            {isLoading && allEntries.length === 0 && (
              <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
