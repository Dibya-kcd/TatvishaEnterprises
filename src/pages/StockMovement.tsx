import { useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowUpRight, ArrowDownRight, ArrowRightLeft, MoreVertical, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { Product } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
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
    <div className="pb-32 md:pb-24">
      <PageHeader 
        title="Stock History"
        subtitle="Complete Transactional Audit Trail"
        onBack={() => navigate("/stock")}
      />

      <ResponsiveContainer className="space-y-4 md:space-y-6 mt-1 md:mt-4">
        <StockTabs />

        {/* Search & Filter pills — consistent */}
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
          <div className="flex-1 w-full relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search by Product, SKU or Batch..."
              className="pl-10 pr-10 h-11 md:h-12 rounded-xl border border-border bg-card font-medium text-sm shadow-sm focus:border-primary/30 focus:ring-0 transition-all w-full"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
            {/* Filter pills — consistent pill row */}
            <div className="flex flex-wrap gap-2 overflow-x-auto pb-0.5 no-scrollbar snap-x">
              {['all', 'purchase', 'dispatch', 'adjustment', 'reversal'].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "h-9 px-4 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all whitespace-nowrap snap-start border",
                    typeFilter === t
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl px-4 h-9 border border-border font-bold text-[11px] uppercase tracking-widest gap-2 bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 shrink-0"
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
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Content Card container with virtualizer */}
        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden flex flex-col">
          <div 
            ref={parentRef}
            className="h-[600px] overflow-auto bg-white scroll-smooth"
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

                const qTrans = entry.qty_transacted;
                const isPositive = qTrans > 0;
                const displayType = entry.entry_type; // e.g. dispatch, purchase, reversal, adjustment

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
                    className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                  >
                    {/* Desktop View */}
                    <div className="hidden md:flex p-4 items-center justify-between gap-4 h-full">
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                          {isPositive ? (
                            <ArrowDownRight className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm text-foreground leading-tight truncate">{entry.product_name}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mt-0.5">{entry.product_sku}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-1">
                        {entry.shop_name && (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="h-4 px-1.5 text-[8px] font-black bg-primary/10 text-primary border-none">SHOP</Badge>
                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[120px]">{entry.shop_name}</span>
                          </div>
                        )}
                        {entry.batch_number && (
                          <Badge variant="outline" className="font-mono text-[9px] h-4 px-1.5 uppercase tracking-tighter">{entry.batch_number}</Badge>
                        )}
                        {getEntryBadge(displayType)}
                      </div>

                      <div className="text-right shrink-0">
                        <span className={cn(
                          "font-black text-base tabular-nums",
                          isPositive ? "text-emerald-600" : "text-destructive"
                        )}>
                          {isPositive ? '+' : ''}{qTrans}
                        </span>
                        <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{fmtDate(entry.created_at)}</span>
                      </div>
                    </div>

                    {/* Mobile optimized view — consistent structure */}
                    <div className="md:hidden p-4 h-full flex flex-col justify-center">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                            {isPositive ? (
                              <ArrowDownRight className="h-4.5 w-4.5 text-emerald-600" />
                            ) : (
                              <ArrowUpRight className="h-4.5 w-4.5 text-destructive" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm text-foreground leading-tight truncate">{entry.product_name}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mt-0.5">{entry.product_sku}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn(
                            "font-black text-base tabular-nums",
                            isPositive ? "text-emerald-600" : "text-destructive"
                          )}>
                            {isPositive ? '+' : ''}{qTrans}
                          </span>
                          <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty state — consistent across all tabs */}
            {allEntries.length === 0 && !isLoading && (
              <div className="py-16 px-6 text-center flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-xs font-black text-muted-foreground/40 uppercase tracking-widest">No records found</p>
                  <p className="text-sm font-medium text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
                </div>
              </div>
            )}

            {/* Loading state — consistent skeleton */}
            {isLoading && allEntries.length === 0 && (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 w-full animate-pulse bg-muted/40 rounded-xl" />
                ))}
              </div>
            )}
          </div>
        </Card>
      </ResponsiveContainer>
    </div>
  );
}
