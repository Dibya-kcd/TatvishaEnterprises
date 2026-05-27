import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Zap, Upload, Package, ArrowRight, History, Minus, Check, LayoutGrid, List, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fmtINR, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type Product } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { useProductsData } from "@/hooks/useProductsData";
import { ProductFilters } from "@/components/products/ProductFilters";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductDrawer } from "@/components/products/ProductDrawer";

import { useIsMobile } from "@/lib/responsive";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";

const StatsCard = ({ label, value, color = "slate" }: { label: string; value: number; color?: string }) => (
  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-1">
    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
      {label}
    </span>
    <span className={cn(
      "text-2xl font-black tabular-nums",
      color === "emerald" ? "text-emerald-600" :
      color === "amber" ? "text-amber-600" :
      color === "rose" ? "text-rose-600" :
      "text-slate-900"
    )}>
      {value}
    </span>
  </div>
);

export default function Products() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loaderRef = React.useRef<HTMLDivElement>(null);
  
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('grid');

  React.useEffect(() => {
    if (!isMobile) {
      if (window.innerWidth >= 1024) {
        setViewMode('list');
      } else {
        setViewMode('grid');
      }
    } else {
      setViewMode('list');
    }
  }, [isMobile]);
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 20;

  const {
    isAdmin,
    state,
    setSearch,
    setCategory,
    setFilter,
    clearFilters,
    showHealConfirm,
    setShowHealConfirm,
    showInactive,
    setShowInactive,
    allItems,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    healing,
    healProgress,
    performHealData,
    healData,
    categories,
    stats,
    refetch,
  } = useProductsData();

  React.useEffect(() => {
    if (viewMode === 'list' && !isMobile) return; 
    
    if (!loaderRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, viewMode, isMobile]);

  const paginatedItems = React.useMemo(() => {
    if (isMobile) return allItems;
    const start = (currentPage - 1) * pageSize;
    return allItems.slice(start, start + pageSize);
  }, [allItems, currentPage, pageSize, isMobile]);

  const totalPages = Math.ceil(stats.total / pageSize);

  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  const handleProductClick = (id: string) => {
    setSelectedProductId(id);
    setIsDrawerOpen(true);
  };

  const handleNewItem = () => {
    setSelectedProductId("new");
    setIsDrawerOpen(true);
  };

  const handleClone = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProductId(`clone:${id}`);
    setIsDrawerOpen(true);
  };

  return (
    <div className="pb-24">
      <ProductDrawer 
        productId={selectedProductId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSaved={refetch}
      />
      
      <PageHeader
        title="Products"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
        action={
          <div className="flex gap-2 items-center">
            {isAdmin && (
              <>
                <Button 
                  variant="outline"
                  size="sm" 
                  className="rounded-xl h-10 border border-slate-200 shadow-sm px-4 font-bold text-xs flex items-center gap-2 hover:bg-slate-50 transition-all" 
                  onClick={healData}
                  disabled={healing}
                >
                  {healing ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Zap className="h-4 w-4 text-primary" />} 
                  <span className="hidden sm:inline text-slate-600">Fix Data</span>
                </Button>
                <Button 
                  variant="outline"
                  size="sm" 
                  className="rounded-xl h-10 border border-slate-200 shadow-sm px-4 font-bold text-xs flex items-center gap-2 hover:bg-slate-50 transition-all" 
                  onClick={() => navigate("/products/import")}
                >
                  <Upload className="h-4 w-4 text-primary" /> 
                  <span className="hidden sm:inline text-slate-600">Import</span>
                </Button>
                <Button 
                  size="sm" 
                  className="rounded-xl h-10 px-5 border shadow-md font-bold text-xs bg-primary text-white flex items-center gap-2 active:scale-95 transition-all" 
                  onClick={handleNewItem}
                >
                  <Plus className="h-4 w-4" /> 
                  <span>Add Product</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-2">
        <StatsCard label="Total Products" value={stats.total} />
        <StatsCard label="Active" value={stats.active} color="emerald" />
        <StatsCard label="Low stock" value={stats.lowStock} color="amber" />
        <StatsCard label="Out of stock" value={stats.outOfStock} color="rose" />
        <div className="hidden lg:flex flex-col gap-1 bg-primary/5 border border-primary/10 rounded-2xl p-4 shadow-sm">
           <span className="text-[10px] font-bold uppercase text-primary/40 tracking-wider">Growth</span>
           <span className="text-2xl font-bold text-primary">+12%</span>
        </div>
      </div>

      <div className="bg-slate-50/50 p-4 rounded-[2.5rem] border border-slate-100 space-y-4">
        <ProductFilters
          categories={categories}
          totalCount={stats.total}
          currentSearch={state.search}
          currentCategory={state.category}
          currentFilters={state.filters}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
          onFilterChange={setFilter}
          onClearFilters={clearFilters}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
        />

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest tabular-nums">
              {stats.total} items
            </span>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('list')}
              className={cn(
                "h-8 px-3 rounded-lg flex items-center gap-2 transition-all",
                viewMode === 'list' ? "bg-primary/10 text-primary" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <List className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase">List</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn(
                "h-8 px-3 rounded-lg flex items-center gap-2 transition-all",
                viewMode === 'grid' ? "bg-primary/10 text-primary" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase">Grid</span>
            </Button>
          </div>
        </div>

        {viewMode === 'grid' || isMobile ? (
          <div className={cn(
            "grid gap-4",
            isMobile ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-4"
          )}>
            {paginatedItems.map(p => (
              <ProductCard 
                key={p.id} 
                product={p} 
                viewMode={viewMode}
                onClick={() => handleProductClick(p.id)} 
                onClone={isAdmin ? handleClone : undefined}
              />
            ))}
          </div>
        ) : (
          <ProductTable 
            products={paginatedItems} 
            onProductClick={(p) => handleProductClick(p.id)} 
            onClone={isAdmin ? handleClone : undefined}
            isLoading={isLoading} 
          />
        )}

        {(hasNextPage || isFetchingNextPage) && viewMode === 'grid' && (
          <div ref={loaderRef} className="flex flex-col items-center justify-center py-12 gap-3 translate-y-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary opacity-50" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading Products</p>
          </div>
        )}

        {!isMobile && viewMode === 'list' && totalPages > 1 && (
           <div className="flex items-center justify-between px-4 py-4 mt-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
             <p className="text-xs font-bold text-slate-500">
               Showing <span className="text-slate-900">{(currentPage-1)*pageSize+1}-{Math.min(currentPage*pageSize, stats.total)}</span> of <span className="text-slate-900">{stats.total}</span> products
             </p>
             <div className="flex items-center gap-2">
               <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="h-9 px-4 rounded-xl font-bold text-xs"
               >
                 <ChevronLeft className="mr-2 h-4 w-4" /> Previous
               </Button>
               <div className="flex items-center gap-1">
                 {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn("h-9 w-9 rounded-xl font-black text-xs", currentPage === pageNum ? "shadow-md" : "")}
                      >
                        {pageNum}
                      </Button>
                    );
                 })}
               </div>
               <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => {
                  if (paginatedItems.length < stats.total && currentPage === totalPages && hasNextPage) {
                    fetchNextPage();
                  }
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                 }}
                className="h-9 px-4 rounded-xl font-bold text-xs"
               >
                 Next <ChevronRight className="ml-2 h-4 w-4" />
               </Button>
             </div>
           </div>
        )}

        {allItems.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-30">
            <Package className="h-12 w-12" />
            <p className="text-xs font-black uppercase tracking-[0.2em]">No Matches Found</p>
          </div>
        )}
      </div>

      <AlertDialog open={showHealConfirm} onOpenChange={setShowHealConfirm}>
        <AlertDialogContent className="rounded-3xl border border-border shadow-2xl max-w-md">
          <AlertDialogHeader>
            <div className="h-16 w-16 bg-primary/5 rounded-2xl flex items-center justify-center text-primary mb-4">
              <Zap className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Clean up product info?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-slate-600 font-medium leading-relaxed">
                <div>This will standardize your catalog information:</div>
                <ul className="space-y-2 list-disc list-inside text-xs font-medium text-slate-700 ml-1">
                  <li>Fix weight labels (e.g. 'gms' to 'g')</li>
                  <li>Sync weight units across records</li>
                  <li>Standardize unit names</li>
                </ul>

                {healing && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-xl space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span>Cleaning Catalog...</span>
                      <span>{healProgress.current} / {healProgress.total}</span>
                    </div>
                    <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300" 
                        style={{ width: `${(healProgress.current / (healProgress.total || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs font-bold text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">
                  Note: This change cannot be undone easily.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            {!healing && <AlertDialogCancel className="h-11 rounded-xl font-bold text-xs flex-1 border">Cancel</AlertDialogCancel>}
            <Button 
              className={cn("h-11 rounded-xl font-bold text-xs flex-[2] bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20", healing && "opacity-50")}
              onClick={performHealData}
              disabled={healing}
            >
              {healing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Start Cleaning"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
