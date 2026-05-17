import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { useIsMobile } from "@/lib/responsive";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  color?: "primary" | "success" | "warning" | "destructive" | "info" | "brand";
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, trend, color = "primary", className, onClick }: StatCardProps) {
  const isMobile = useIsMobile();
  const colorMap = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-status-delivered/10 text-status-delivered border-status-delivered/20",
    warning: "bg-status-pending/10 text-status-pending border-status-pending/20",
    destructive: "bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20",
    info: "bg-status-approved/10 text-status-approved border-status-approved/20",
    brand: "bg-brand-primary/10 text-brand-primary border-brand-primary/20",
  };

  return (
    <Card 
      onClick={onClick}
      className={cn(
        "border-border/60 shadow-sm overflow-hidden h-full group hover:border-primary/20 transition-all md:rounded-2xl", 
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      <CardContent className="p-4 md:p-5 lg:p-6 h-full flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start text-center md:text-left gap-3 md:gap-4">
        <div className={cn("h-11 w-11 md:h-10 md:w-10 rounded-[1.25rem] md:rounded-xl flex items-center justify-center mb-0 md:mb-0 border shadow-sm transition-transform group-hover:scale-110 shrink-0", colorMap[color])}>
          <Icon size={isMobile ? 20 : 18} />
        </div>
        
        <div className="space-y-1 w-full min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 truncate">{label}</p>
          <div className="flex flex-col md:flex-row md:items-baseline md:gap-2">
            <h3 className="text-lg md:text-lg lg:text-xl font-black tracking-tight text-foreground tabular-nums leading-none pb-0.5 break-all">
              {value}
            </h3>
            
            {trend && (
              <div className={cn(
                "flex items-center justify-center md:justify-start gap-1 text-[10px] font-bold",
                trend.isPositive ? "text-status-delivered" : "text-status-cancelled"
              )}>
                {trend.isPositive ? <TrendingUp size={10} strokeWidth={3} /> : <TrendingDown size={10} strokeWidth={3} />}
                <span>{trend.value}%</span>
                {trend.label && <span className="text-muted-foreground/40 font-black ml-0.5 uppercase tracking-tighter hidden lg:inline">vs {trend.label}</span>}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
