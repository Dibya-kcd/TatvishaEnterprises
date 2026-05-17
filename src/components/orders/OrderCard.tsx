import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Calendar, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  shop_name: string | null;
  total: number;
  order_date: string | null;
  created_at: string;
  salesperson_name: string | null;
}

interface OrderCardProps {
  order: OrderSummary;
  isAdmin: boolean;
  onAction: (id: string, action: 'approved' | 'dispatched' | 'delivered', e: React.MouseEvent) => void;
  onDelete: (id: string, status: string, e: React.MouseEvent) => void;
}

export const OrderCard = React.memo(({ order, isAdmin, onAction, onDelete }: OrderCardProps) => {
  const navigate = useNavigate();
  const o = order;

  return (
    <div 
      className="p-5 border border-slate-200/60 rounded-3xl bg-white shadow-sm hover:shadow-xl transition-all cursor-pointer active:scale-[0.98] group flex flex-col justify-between min-h-[180px] hover:border-brand-primary/20"
      onClick={() => navigate(`/orders/${o.id}`)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-black text-slate-400 uppercase tracking-wider">#{o.order_number}</span>
              <Badge 
                variant="outline"
                className={cn(
                  "h-5 px-2 text-[9px] font-black uppercase tracking-widest rounded-lg border-none shadow-none",
                  statusColor[o.status as keyof typeof statusColor]
                )}
              >
                {statusLabel[o.status as keyof typeof statusLabel]}
              </Badge>
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 leading-tight group-hover:text-brand-primary transition-colors line-clamp-1">{o.shop_name ?? "Unassociated Shop"}</h3>
          </div>
          <div className="text-right">
            <div className={cn(
              "text-[18px] font-medium tabular-nums tracking-tighter",
              o.total > 10000 ? "text-[#FF7F50]" : "text-slate-900"
            )}>
              {fmtINR(o.total)}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">
              <Calendar className="h-3 w-3" />
              {format(new Date(o.order_date || o.created_at), 'dd MMM yyyy')}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-4 mt-auto border-t border-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
              {o.salesperson_name?.charAt(0) || 'S'}
            </div>
            <span className="text-[11px] font-bold text-slate-400 italic">
              {o.salesperson_name || 'Staff'}
            </span>
          </div>

          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {o.status === 'pending_approval' && isAdmin && (
              <Button 
                size="sm" 
                className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest px-3 shadow-lg shadow-emerald-600/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(o.id, 'approved', e);
                }}
              >
                Approve
              </Button>
            )}
            {o.status === 'approved' && (
              <Button 
                size="sm" 
                className="h-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[9px] uppercase tracking-widest px-3 shadow-lg shadow-amber-500/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(o.id, 'dispatched', e);
                }}
              >
                Dispatch
              </Button>
            )}
            {o.status === 'dispatched' && (
              <Button 
                size="sm" 
                className="h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-widest px-3 shadow-lg shadow-indigo-600/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(o.id, 'delivered', e);
                }}
              >
                Deliver
              </Button>
            )}
            
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100">
                     <MoreVertical className="h-4 w-4 text-slate-400" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="rounded-2xl p-2 w-48 shadow-2xl border-none ring-1 ring-black/5">
                  <DropdownMenuItem className="rounded-xl font-bold text-xs py-3" onClick={() => navigate(`/orders/${o.id}`)}>
                     View Detail
                  </DropdownMenuItem>
                  {isAdmin && (o.status === 'draft' || o.status === 'pending_approval') && (
                    <DropdownMenuItem className="rounded-xl font-bold text-xs py-3 text-red-600 hover:bg-red-50" onClick={(e) => onDelete(o.id, o.status, e as React.MouseEvent)}>
                       Delete Permanent
                    </DropdownMenuItem>
                  )}
               </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
});

OrderCard.displayName = "OrderCard";
