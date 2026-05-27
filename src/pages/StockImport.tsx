import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  Search, 
  Loader2, 
  Upload, 
  Download, 
  Sparkles, 
  ChevronDown,
  ChevronUp,
  Box,
  Edit2,
  Camera,
  X
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type PackType, type PricingProduct, getPackMultiplier, landedCostPerLevel, autoCalcAllTiers } from "@/lib/pricing";
import { type Product } from "@/types";
import { LandedCostFields } from "@/components/inventory/LandedCostFields";
import { buildNormalizedCatalog, matchProduct, type MatchResult, type MatchStatus } from '@/lib/grnMatcher';
import { getLearnedMap, recordCorrection } from '@/lib/supplierMappings';
import { useStockImport, 
  type StockItem, 
  type ExtractedItem, 
  mmyyToIsoExpiryDate, 
  addMonthsMMYY 
} from "@/hooks/useStockImport";
import { useIsMobile } from "@/lib/responsive";
import { ImportPreviewTable } from "@/components/stock/ImportPreviewTable";
import { SupplierCombobox } from "@/components/stock/SupplierCombobox";

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

export default function StockImport() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from("products").select("*, inventory(quantity)").order("name");
      if (data) setProducts((data as unknown) as Product[]);
      setLoading(false);
    };
    fetchProducts();
  }, []);

  const {
    isAdmin,
    items,
    invoiceNumber,
    setInvoiceNumber,
    supplierName,
    setSupplierName,
    invoiceDate,
    setInvoiceDate,
    totalFreight,
    setTotalFreight,
    totalHandling,
    setTotalHandling,
    globalPackedDate,
    updateAllPackedDate,
    stats,
    parsing,
    handleFileUpload,
    onPasteExtract,
    confirmMapping,
    handleImport,
    addItem,
    updateItem,
    removeItem,
    pendingItems,
    isBulkImportOpen,
    setIsBulkImportOpen,
    bulkStep,
    setBulkStep
  } = useStockImport(products);

  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);

  const editingItem = items.find(it => it.id === editingItemId);

  if (loading) return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin text-zinc-300" /></div>;
  if (!isAdmin) return <div className="p-8 text-center font-bold text-zinc-400">Admin access required</div>;

  return (
    <div className="mx-auto max-w-[420px] lg:max-w-4xl bg-[#F5F4F0] min-h-screen pb-24 font-sans select-none overflow-x-hidden">
      <div className="sticky top-0 z-50 bg-white border-b border-black/5 px-4 py-3 flex items-center justify-between shadow-sm backdrop-blur-md bg-opacity-90">
        <h1 className="text-sm font-bold uppercase tracking-tight text-zinc-900">Inward GRN Import</h1>
        <Button 
          variant="outline" 
          size="sm"
          className="h-7 px-2.5 bg-[#EFF6FF] text-[#2563EB] border-none hover:bg-blue-100 font-medium text-[10px] gap-1.5 rounded-full"
          onClick={() => document.getElementById("smart-import-file")?.click()}
          disabled={parsing}
        >
          {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          AI IMPORT
        </Button>
        <input 
          id="smart-import-file"
          type="file" 
          className="hidden" 
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" 
          onChange={handleFileUpload} 
        />
      </div>

      <div className="p-4 space-y-4">
        <Collapsible open={isHeaderOpen} onOpenChange={setIsHeaderOpen} className="bg-white border border-black/5 rounded-xl transition-all duration-300 overflow-hidden">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Header details</span>
              {isHeaderOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 pt-0 space-y-4 border-t border-black/5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Invoice</Label>
                <Input 
                  value={invoiceNumber} 
                  onChange={e => setInvoiceNumber(e.target.value)} 
                  placeholder="INV-001"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all uppercase font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Supplier</Label>
                <SupplierCombobox 
                  value={supplierName} 
                  onChange={setSupplierName} 
                  placeholder="Supplier Name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Invoice Date</Label>
              <Input 
                type="date"
                value={invoiceDate} 
                onChange={e => setInvoiceDate(e.target.value)} 
                className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all block w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Freight (₹)</Label>
                <Input 
                  type="number"
                  value={totalFreight} 
                  onChange={e => setTotalFreight(e.target.value)} 
                  placeholder="0.00"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Handling (₹)</Label>
                <Input 
                  type="number"
                  value={totalHandling} 
                  onChange={e => setTotalHandling(e.target.value)} 
                  placeholder="0.00"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-medium"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Packed MMYY</Label>
              <Input 
                maxLength={4}
                value={globalPackedDate} 
                onChange={e => updateAllPackedDate(e.target.value.replace(/\D/g, "").slice(0, 4))} 
                placeholder="MMYY (e.g. 0524)"
                className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-mono font-medium"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Units", value: stats.totalBaseUnits },
            { label: "Line Items", value: items.length },
            { label: "Total Weight", value: `${stats.totalWeight.toFixed(2)} KG` },
            { label: "Avg Profit", value: `${stats.avgProfit.toFixed(1)}%`, color: stats.avgProfit > 0 ? "text-[#10B981]" : "text-red-500" },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-black/5 p-3 rounded-lg flex flex-col justify-between h-16 shadow-none">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</span>
              <span className={cn("text-base font-bold text-zinc-900 leading-none", stat.color)}>{stat.value}</span>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-black/10 border-dashed rounded-xl shadow-inner-sm">
            <Box className="h-12 w-12 text-zinc-200 mb-4" strokeWidth={1.5} />
            <p className="text-sm font-medium text-zinc-400 mb-6">No items added yet</p>
            <div className="flex gap-2">
              <Button 
                onClick={() => { setEditingItemId(null); setIsAddItemOpen(true); }}
                className="bg-black text-white rounded-full h-10 px-6 text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95"
              >
                + Add item
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setBulkStep(1); setIsBulkImportOpen(true); }}
                className="rounded-full h-10 px-6 text-xs font-bold border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95"
              >
                Bulk import
              </Button>
            </div>
          </div>
        )}

        <ImportPreviewTable 
          items={items} 
          products={products} 
          totalFreight={Number(totalFreight) || 0}
          totalHandling={Number(totalHandling) || 0}
          onEdit={(id) => { setEditingItemId(id); setIsAddItemOpen(true); }}
          onRemove={removeItem}
        />

        {items.length > 0 && (
          <div className="flex justify-center pt-2">
             <Button variant="ghost" className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-9" onClick={() => { setEditingItemId(null); setIsAddItemOpen(true); }}>
               <Plus className="mr-1.5 h-3 w-3" /> Add more items
             </Button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-black/5 bg-opacity-95 backdrop-blur-md z-40 max-w-[420px] lg:max-w-4xl mx-auto shadow-[0_-10px_30_30px_-15px_rgba(0,0,0,0.1)]">
          <Button 
            className="w-full bg-black text-white h-12 rounded-xl text-sm font-bold shadow-xl active:scale-[0.98] transition-all"
            onClick={() => handleImport(() => navigate("/stock"))}
          >
            Finalize {items.length} items to GRN
          </Button>
        </div>
      )}

      <AddItemDrawer 
        open={isAddItemOpen}
        onOpenChange={setIsAddItemOpen}
        products={products}
        editingItem={editingItem}
        onAdd={addItem}
        onUpdate={(field, val) => editingItemId && updateItem(editingItemId, field, val)}
        onClose={() => setIsAddItemOpen(false)}
      />

      <BulkImportWizard 
        open={isBulkImportOpen}
        onOpenChange={setIsBulkImportOpen}
        step={bulkStep}
        setStep={setBulkStep}
        onFileUpload={handleFileUpload}
        parsing={parsing}
        onPasteExtract={onPasteExtract}
        pendingItems={pendingItems}
        products={products}
        onConfirm={confirmMapping}
        supplierName={supplierName}
        totalWeight={stats.totalWeight}
        avgProfit={stats.avgProfit}
        totalFreight={totalFreight}
        totalHandling={totalHandling}
      />
    </div>
  );
}

function AddItemDrawer({ open, onOpenChange, products, editingItem, onAdd, onUpdate, onClose }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  editingItem?: StockItem;
  onAdd: (p: Product) => void;
  onUpdate: (field: keyof StockItem, val: unknown) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("max-h-[85vh] overflow-y-auto rounded-t-3xl border-t-0 p-0 shadow-2xl overflow-x-hidden", !isMobile && "w-[560px] h-full rounded-none")}>
        <div className="mx-auto max-w-[420px] lg:max-w-full pb-10">
          <SheetHeader className="p-6 border-b border-black/5 bg-zinc-50/50">
            <SheetTitle className="text-sm font-bold tracking-tight uppercase text-center">
              {editingItem ? "Edit item" : "Add item to GRN"}
            </SheetTitle>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {!editingItem ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input 
                    className="pl-10 pr-10 h-11 rounded-xl border-zinc-100 bg-zinc-50/50"
                    placeholder="Search product..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button 
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-zinc-300 hover:text-zinc-600 transition-colors"
                      title="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filteredProducts.map(p => (
                    <div 
                      key={p.id} 
                      className="p-3 bg-white border border-black/5 rounded-xl active:bg-zinc-50 transition-colors flex justify-between items-center cursor-pointer"
                      onClick={() => onAdd(p)}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[12px] font-bold text-zinc-900 uppercase leading-normal mb-1">{p.name}</p>
                        <p className="text-[9px] font-mono text-zinc-400 mt-1 uppercase tracking-tighter">{p.sku}</p>
                      </div>
                      <Plus className="h-4 w-4 text-zinc-300" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                 <div className="bg-zinc-50 p-4 rounded-xl border border-black/5">
                    <p className="text-[12px] font-bold text-zinc-900 uppercase leading-normal mb-1">{editingItem.name}</p>
                    <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-tighter">{editingItem.sku}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Qty</Label>
                      <Input 
                        type="number"
                        className="h-11 rounded-lg border-zinc-100 bg-white"
                        value={editingItem.quantity}
                        onChange={e => onUpdate("quantity", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pack Type</Label>
                      <Select value={editingItem.packType} onValueChange={(v) => onUpdate("packType", v)}>
                        <SelectTrigger className="h-11 rounded-lg border-zinc-100 bg-white uppercase text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="unit">UNIT</SelectItem>
                          <SelectItem value="packet">PACKET</SelectItem>
                          <SelectItem value="case">CASE</SelectItem>
                          <SelectItem value="kg">KG</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <LandedCostFields 
                         product={{ 
                           id: editingItem.productId, 
                           units_per_packet: editingItem.unitsPerPacket, 
                           packets_per_case: editingItem.packetsPerCase,
                           pack_size_value: editingItem.pack_size_value,
                           pack_size_unit: editingItem.pack_size_unit,
                           mrp: editingItem.mrp,
                           unit_type: editingItem.unit_type
                         }}
                         qty={editingItem.quantity}
                         unitCost={editingItem.unitCost}
                         freightTotal={editingItem.freightTotal || 0}
                         handlingTotal={editingItem.handlingTotal || 0}
                         taxPct={editingItem.taxPct || 0}
                         onFreightChange={(v) => onUpdate("freightTotal", v)}
                         onHandlingChange={(v) => onUpdate("handlingTotal", v)}
                         onTaxChange={(v) => onUpdate("taxPct", v)}
                       />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expiry (MMYY)</Label>
                       <Input 
                         maxLength={4}
                         placeholder="0524"
                         className="h-11 rounded-lg border-zinc-100 bg-white"
                         value={editingItem.packedDate || ""}
                         onChange={e => {
                           const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                           onUpdate("packedDate", val);
                           if (val.length === 4) {
                             const exp = mmyyToIsoExpiryDate(addMonthsMMYY(val, 12));
                             if (exp) onUpdate("expiryDate", exp); // Safe since StockItem allows expiryDate as string
                           }
                         }}
                       />
                    </div>
                 </div>
                 <Button className="w-full bg-black text-white h-12 rounded-xl text-sm font-bold" onClick={onClose}>Update item</Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
function BulkImportWizard({ 
  open, 
  onOpenChange, 
  step, 
  setStep, 
  onFileUpload, 
  parsing, 
  onPasteExtract, 
  pendingItems,
  products,
  onConfirm,
  supplierName,
  totalWeight,
  avgProfit,
  totalFreight,
  totalHandling
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: 1 | 2 | 3;
  setStep: (step: 1 | 2 | 3) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  parsing: boolean;
  onPasteExtract: (text: string) => Promise<void>;
  pendingItems: ExtractedItem[];
  products: Product[];
  onConfirm: (items: Omit<StockItem, "id">[]) => void;
  supplierName: string;
  totalWeight: number;
  avgProfit: number;
  totalFreight: string;
  totalHandling: string;
}) {
  const [pastedText, setPastedText] = useState("");
  const [mappings, setMappings] = useState<(ExtractedItem & { 
    matchedProduct: Product | null; 
    match_status: MatchStatus;
    match_score: number;
    suggestions: MatchResult['suggestions'];
    accepted?: boolean;
    id: string;
  })[]>([]);
  const [filter, setFilter] = useState<"all" | "errors" | "ready">("all");
  const [manualSearch, setManualSearch] = useState("");
  const debouncedManualSearch = useDebounce(manualSearch, 300);

  useEffect(() => {
    if (step === 2 && pendingItems.length > 0) {
      const runMatching = async () => {
        const learnedMap = await getLearnedMap(supplierName || "");
        const normalizedCatalog = products.map(p => ({ 
          id: p.id, 
          name: p.name, 
          sku: p.sku || "", 
          normalized_name: p.name.toLowerCase().trim() 
        }));
        
        const initial = pendingItems.map((item) => {
          const learned = learnedMap.get(item.sku_or_name.toLowerCase().trim());
          const learnedProduct = learned ? products.find(p => p.id === learned) : null;
          const result = matchProduct(item.sku_or_name, normalizedCatalog);

          if (learnedProduct) {
            return {
              ...item,
              matchedProduct: learnedProduct,
              match_status: "MATCHED" as const,
              match_score: 390,
              suggestions: [],
              accepted: true,
              id: crypto.randomUUID()
            };
          }

          return { 
            ...item, 
            matchedProduct: result.matched_product ? products.find(p => p.id === result.matched_product?.id) || null : null, 
            match_status: result.match_status, 
            match_score: result.match_score, 
            suggestions: result.suggestions,
            accepted: result.match_status === "MATCHED",
            id: crypto.randomUUID()
          };
        });
        setMappings(initial);
      };
      runMatching();
    }
  }, [step, pendingItems, products, supplierName]);

  const readyCount = mappings.filter(m => m.match_status === "MATCHED").length;
  const filteredCatalog = useMemo(() => {
    const s = debouncedManualSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(s) || (p.sku && p.sku.toLowerCase().includes(s))).slice(0, 50);
  }, [debouncedManualSearch, products]);

  const finalizeImport = async () => {
    const stockItems: Omit<StockItem, "id">[] = mappings
      .filter((m): m is (typeof m & { matchedProduct: Product }) => m.matchedProduct !== null && m.match_status === "MATCHED")
      .map(m => ({
        productId: m.matchedProduct!.id,
        name: m.matchedProduct!.name,
        sku: m.matchedProduct!.sku,
        quantity: m.quantity || 1,
        unitCost: m.cost_per_pack || 0,
        expiryDate: m.expiry_date || "",
        packType: m.pack_type || "unit",
        unitsPerPacket: m.extracted_multipliers?.units_per_packet || m.matchedProduct!.units_per_packet || 1,
        packetsPerCase: m.extracted_multipliers?.packets_per_case || m.matchedProduct!.packets_per_case || 1,
      }));

    for (const m of mappings) {
      if (m.matchedProduct && m.match_status !== "MATCHED") {
        await recordCorrection(m.sku_or_name, m.matchedProduct.id, supplierName || "");
      }
    }

    onConfirm(stockItems);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t-0 p-0 shadow-2xl focus:outline-none">
        <div className="mx-auto max-w-[420px] pb-10">
          <SheetHeader className="p-4 border-b border-black/5 bg-zinc-50/50 flex flex-row items-center justify-between">
            <SheetTitle className="text-[10px] font-bold tracking-widest uppercase text-zinc-400">Step {step}</SheetTitle>
            <div className="flex gap-1">
              {[1, 2, 3].map(s => (
                <div key={s} className={cn("h-1 w-4 rounded-full transition-all", step >= s ? "bg-black" : "bg-zinc-200")} />
              ))}
            </div>
          </SheetHeader>

          {step === 1 && (
            <div className="p-4 pt-6 space-y-6">
              <Tabs defaultValue="upload">
                <TabsList className="grid w-full grid-cols-3 h-11 bg-zinc-100 rounded-xl p-1 mb-6">
                  <TabsTrigger value="upload" className="text-[11px] font-bold uppercase transition-all">Upload</TabsTrigger>
                  <TabsTrigger value="snap" className="text-[11px] font-bold uppercase transition-all">Snap</TabsTrigger>
                  <TabsTrigger value="paste" className="text-[11px] font-bold uppercase transition-all">Paste</TabsTrigger>
                </TabsList>
                <TabsContent value="upload">
                   <div 
                    className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center group cursor-pointer"
                    onClick={() => document.getElementById("bulk-upload-file")?.click()}
                  >
                    <Upload className="h-10 w-10 text-zinc-300 mb-4" />
                    <p className="text-sm font-bold text-zinc-900 leading-none uppercase">CSV / XLSX</p>
                    <input id="bulk-upload-file" type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onFileUpload} />
                  </div>
                </TabsContent>
                <TabsContent value="snap">
                   <div 
                    className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center group cursor-pointer"
                    onClick={() => document.getElementById("bulk-snap-file")?.click()}
                  >
                    <Camera className="h-10 w-10 text-zinc-300 mb-4" strokeWidth={1} />
                    <p className="text-sm font-bold text-zinc-900 leading-none uppercase">SNAP INVOICE</p>
                    <input id="bulk-snap-file" type="file" className="hidden" accept="image/*" capture="environment" onChange={onFileUpload} />
                  </div>
                </TabsContent>
                <TabsContent value="paste" className="space-y-4">
                  <textarea 
                    className="w-full h-40 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-[11px] font-mono focus:outline-none placeholder:text-zinc-300"
                    placeholder="Paste invoice text..."
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                  />
                  <Button className="w-full bg-black text-white h-12 rounded-xl text-sm font-bold" onClick={() => onPasteExtract(pastedText)} disabled={parsing}>
                    {parsing ? <Loader2 className="animate-spin h-4 w-4" /> : "Extract with AI"}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col h-[70vh]">
              <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 pt-4">
                {mappings.map((m) => (
                  <div key={m.id} className="p-3 bg-white rounded-xl border border-black/5 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                       <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-bold text-zinc-900 uppercase leading-normal mb-1">{m.matchedProduct?.name || "Unmapped item"}</p>
                          <p className="text-[10px] font-mono text-zinc-400 mt-1 uppercase tracking-tighter">{m.sku_or_name}</p>
                       </div>
                    </div>
                    <Select value={m.matchedProduct?.id || "none"} onValueChange={(v) => {
                      const p = products.find(x => x.id === v);
                      setMappings(prev => prev.map(mm => mm.id === m.id ? { ...mm, matchedProduct: p || null, match_status: p ? "MATCHED" : "UNMATCHED" } : mm));
                    }}>
                      <SelectTrigger className="h-10 rounded-lg text-xs font-medium bg-zinc-50 border-none">
                        <SelectValue placeholder="Map to catalog..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] rounded-xl">
                        <SelectItem value="none" className="text-[11px] font-bold text-zinc-400">--- No Match ---</SelectItem>
                        {filteredCatalog.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-xs font-medium uppercase py-2.5">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <footer className="absolute bottom-0 left-0 w-full bg-white border-t p-4 flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl h-11 text-[13px] font-bold" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-[2] bg-black text-white h-11 rounded-xl text-[13px] font-bold" onClick={() => setStep(3)}>Review {readyCount} items</Button>
              </footer>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col h-[70vh]">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                {mappings.filter(m => m.match_status === "MATCHED").map((m) => (
                   <div key={m.id} className="p-3 bg-white border border-black/5 rounded-xl">
                      <p className="text-[13px] font-bold text-zinc-900 leading-normal uppercase mb-2">{m.matchedProduct?.name}</p>
                      <p className="text-[10px] text-zinc-400 font-bold">{m.quantity} {m.pack_type} @ {fmtINR(m.cost_per_pack)}</p>
                   </div>
                ))}
              </div>
              <footer className="absolute bottom-0 left-0 w-full bg-white border-t p-4">
                <Button className="w-full bg-black text-white h-12 rounded-xl text-[13px] font-bold" onClick={finalizeImport}>
                  Confirm import
                </Button>
              </footer>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
