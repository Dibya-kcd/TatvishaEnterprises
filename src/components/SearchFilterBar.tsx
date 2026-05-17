import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FilterOption {
  id: string;
  label: string;
  icon?: 'sort' | 'filter' | 'user';
  options: string[];
  optionLabels?: Record<string, string>;
}

interface SearchFilterBarProps {
  categories: { label: string; count?: number }[];
  filters: FilterOption[];
  totalCount: number;
  currentSearch: string;
  currentCategory: string;
  currentFilters: Record<string, string>;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onFilterChange: (id: string, value: string) => void;
  onClearFilters: () => void;
  hideSearch?: boolean;
  placeholder?: string;
  showInactive?: boolean;
  onShowInactiveChange?: (v: boolean) => void;
}

export function SearchFilterBar({
  categories,
  filters,
  totalCount,
  currentSearch,
  currentCategory,
  currentFilters,
  onSearchChange,
  onCategoryChange,
  onFilterChange,
  onClearFilters,
  hideSearch = false,
  placeholder = "Search data...",
  showInactive,
  onShowInactiveChange,
}: SearchFilterBarProps) {
  const hasActiveFilters = currentSearch !== '' || currentCategory !== 'All' || Object.keys(currentFilters).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 w-full max-w-full px-4 lg:px-0">
        {!hideSearch && (
          <div className="relative flex-1 group lg:max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 md:h-5 md:w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-700 transition-colors pointer-events-none" />
            <Input
              placeholder={placeholder}
              className="pl-9 md:pl-13 h-9 md:h-14 border border-black/[0.04] bg-white md:bg-[#f8f7f4] focus-visible:ring-0 focus-visible:border-black/10 rounded-lg md:rounded-[22px] transition-all text-slate-700 placeholder:text-slate-400 font-bold text-xs md:text-base shadow-sm w-full"
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}

        {onShowInactiveChange && (
          <div className="hidden sm:flex items-center gap-3 bg-white px-4 h-9 md:h-14 rounded-lg md:rounded-[20px] border border-black/[0.04] md:border-[#e8dfd5] shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] whitespace-nowrap">Show Inactive</span>
            <Switch 
              checked={showInactive} 
              onCheckedChange={onShowInactiveChange}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        )}
        
        {filters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={cn(
                  "h-9 w-9 md:h-14 md:w-14 rounded-lg md:rounded-[20px] bg-white md:bg-[#fdfaf6] border border-black/[0.04] md:border-[#e8dfd5] shadow-sm transition-all hover:bg-amber-50 active:scale-95 shrink-0 flex items-center justify-center text-slate-500 md:text-[#a8522b] group",
                  hasActiveFilters && "ring-2 ring-amber-700/10 border-amber-700/20"
                )}
              >
                <SlidersHorizontal className="h-4 w-4 md:h-6 md:w-6 transition-transform group-hover:rotate-12" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl border-border shadow-2xl p-2 animate-in slide-in-from-top-2">
              <DropdownMenuLabel className="text-[10px] font-black text-muted-foreground/40 px-3 py-2 uppercase tracking-[0.2em]">Filter & sort</DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 opacity-50" />
              {filters.map(f => (
                <div key={f.id} className="p-1">
                   <p className="px-3 py-1.5 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{f.label}</p>
                   {f.options.map(opt => (
                     <DropdownMenuItem
                       key={opt}
                       className={cn(
                        "py-3 px-3 rounded-xl cursor-pointer text-sm font-bold transition-colors",
                        currentFilters[f.id] === opt 
                          ? "bg-primary/10 text-primary shadow-sm" 
                          : "hover:bg-muted"
                       )}
                       onClick={() => onFilterChange(f.id, opt)}
                     >
                       <span className="flex-1">{f.optionLabels ? (f.optionLabels[opt] || opt) : opt}</span>
                       {currentFilters[f.id] === opt && <X className="h-3 w-3 opacity-40" />}
                     </DropdownMenuItem>
                   ))}
                </div>
              ))}
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator className="mx-2 opacity-50" />
                  <DropdownMenuItem 
                    className="py-3 px-3 rounded-xl cursor-pointer text-xs font-black uppercase tracking-widest text-destructive hover:bg-destructive/5 justify-center"
                    onClick={onClearFilters}
                  >
                    Reset all parameters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      <div className="w-full relative group/filters">
        <div className="overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex items-center gap-1.5 px-4 lg:px-0 py-2 min-w-max">
            {categories.map((cat) => (
              <button
                key={cat.label}
                onClick={() => onCategoryChange(cat.label)}
                className={cn(
                  "h-8 md:h-11 rounded-xl px-4 md:px-6 text-[10px] md:text-[13px] font-bold transition-all whitespace-nowrap border shadow-sm group active:scale-95 flex items-center justify-center min-w-[70px] md:min-w-[100px] gap-2.5",
                  currentCategory === cat.label 
                    ? "bg-slate-900 border-slate-900 text-white shadow-md ring-1 ring-slate-900/10" 
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-md"
                )}
              >
                {cat.label !== 'All' && (
                  <div className={cn(
                    "h-1.5 w-1.5 rounded-full ring-2 ring-white/20",
                    cat.label === 'Pending' ? "bg-amber-500" :
                    cat.label === 'Approved' ? "bg-blue-500" :
                    cat.label === 'Dispatched' ? "bg-violet-600" :
                    cat.label === 'Delivered' ? "bg-emerald-500" :
                    cat.label === 'Rejected' ? "bg-rose-500" :
                    cat.label === 'Cancelled' ? "bg-slate-400" :
                    "bg-slate-300"
                  )} />
                )}
                {cat.label} {cat.count !== undefined && <span className={cn("ml-0.5 tabular-nums opacity-60", currentCategory === cat.label ? "text-white" : "text-slate-400")}>{cat.count}</span>}
              </button>
            ))}
            {/* Horizontal padding spacer */}
            <div className="w-8 lg:hidden shrink-0" />
          </div>
        </div>
        {/* Subtle right-fade gradient to hint scrollability */}
        <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-l from-[#f8f7f4] via-[#f8f7f4]/80 to-transparent pointer-events-none lg:hidden" />
      </div>
    </div>
  );
}
