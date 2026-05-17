import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import * as React from "react";

interface ListCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export function ListCard({ 
  title, 
  subtitle, 
  meta, 
  badge, 
  icon, 
  onClick, 
  className,
  active 
}: ListCardProps) {
  return (
    <Card 
      className={cn(
        "group border-border/60 shadow-sm transition-all duration-200 active:scale-[0.98] overflow-hidden",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-md",
        active && "border-primary/40 bg-primary/5",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5 flex items-center gap-4">
        {icon && (
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border border-border/40 bg-muted/30 transition-colors",
            active ? "bg-primary/10 border-primary/20 text-primary" : "text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary group-hover:border-primary/10"
          )}>
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className={cn(
              "font-bold text-sm tracking-tight text-foreground transition-colors whitespace-normal",
              onClick && "group-hover:text-primary"
            )}>
              {title}
            </h3>
            {badge}
          </div>
          {subtitle && (
            <div className="text-[11px] font-medium text-muted-foreground line-clamp-1 leading-relaxed">
              {subtitle}
            </div>
          )}
          {meta && (
            <div className="mt-2 pt-2 border-t border-border/40">
              {meta}
            </div>
          )}
        </div>
        {onClick && (
          <div className={cn(
            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all border border-transparent",
            active ? "bg-primary text-white" : "bg-muted/50 text-muted-foreground group-hover:bg-primary group-hover:text-white group-hover:shadow-md group-hover:shadow-primary/10"
          )}>
            <ChevronRight size={16} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
