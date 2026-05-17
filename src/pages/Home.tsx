import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Store,
  Wallet,
  Trash2,
  X,
  Package,
  Users,
} from "lucide-react";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ListCard } from "@/components/ListCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useIsMobile, useIsTablet } from "@/lib/responsive";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useHomeQueue } from "@/hooks/useHomeQueue";

import {
  ResponsiveContainer,
  AdaptiveTable,
} from "@/components/ui/responsive-ui";

export default function Home() {
  const { stats, isLoading, acting, decide } = useHomeQueue();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const currentUser = useCurrentUser();

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  return (
    <div className="space-y-6 pb-32 md:pb-8">
      {/* Page Header (Unified) */}
      <PageHeader 
        title="Dashboard" 
        subtitle="Today's activity at a glance"
        actionLabel="New order"
        actionIcon={<Plus size={16} />}
        onAction={() => navigate("/orders/new")}
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Main Panel (Left) */}
        <div className="md:col-span-7 lg:col-span-8 space-y-6">
          {/* Hero Card */}
          <Card className="relative overflow-hidden border-0 bg-primary text-white shadow-xl shadow-primary/10 rounded-2xl">
            {/* Visual element */}
            <div className="absolute top-0 right-0 h-32 w-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
            
            <CardContent className="relative p-6 md:p-8 lg:p-10 z-10 space-y-8 flex flex-col h-full justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Today's Revenue</div>
                <div className="text-4xl sm:text-5xl font-black tracking-tighter tabular-nums">
                  {stats ? fmtINR(stats.salesToday) : "₹0.00"}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-1">Orders Pending</div>
                  <div className="text-xl font-black truncate">{stats?.pending ?? 0} <span className="text-[10px] uppercase font-bold text-white/40 ml-1">Today</span></div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-1">Receivables</div>
                  <div className="text-xl font-black truncate">{stats ? fmtINR(stats.outstanding) : "₹0"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            <StatCard 
              label="Pending" 
              value={stats?.pending ?? 0} 
              icon={Clock} 
              color="warning" 
              onClick={() => navigate("/orders?status=pending_approval")}
            />
            <StatCard 
              label="Approved" 
              value={stats?.approved ?? 0} 
              icon={CheckCircle2} 
              color="success" 
              onClick={() => navigate("/orders?status=approved")}
            />
            <StatCard 
              label="Dispatched" 
              value={stats?.dispatched ?? 0} 
              icon={ClipboardList} 
              color="info" 
              onClick={() => navigate("/orders?status=dispatched")}
            />
            <StatCard 
              label="Low Stock" 
              value={stats?.lowStock.length ?? 0} 
              icon={Package} 
              color="destructive" 
              onClick={() => navigate("/stock")}
            />
            <StatCard 
              label="Expiring" 
              value={stats?.expiring.length ?? 0} 
              icon={AlertTriangle} 
              color="warning" 
              onClick={() => navigate("/stock")}
            />
            <StatCard 
              label="Top Agent" 
              value={stats?.topSalespeople[0]?.name.split(' ')[0] ?? "—"} 
              icon={Users} 
              color="brand" 
              onClick={() => navigate("/reports")}
            />
          </div>

          {/* Pulse Chart */}
          <Card className="border-border/60 rounded-2xl bg-card shadow-sm overflow-hidden border border-slate-100">
            <CardContent className="p-6 md:p-8 lg:p-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <SectionHeader 
                  title="Revenue trend" 
                  subtitle="Performance over last 7 days"
                />
                {!isLoading && stats && (
                  <div className="flex items-center gap-3 bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">7-Day Total</span>
                      <span className="text-lg font-black text-primary tabular-nums">{fmtINR(stats.trend.reduce((a,b) => a + b.total, 0))}</span>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-600 border-none rounded-lg px-2 py-0.5 text-[10px] font-black">
                      +12.5%
                    </Badge>
                  </div>
                )}
              </div>
              <div className="min-h-[160px] flex flex-col justify-center">
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-1/3 rounded-lg shimmer" />
                    <Skeleton className="h-40 w-full rounded-2xl shimmer" />
                  </div>
                ) : stats && <Sparkline data={stats.trend} />}
              </div>
            </CardContent>
          </Card>

          {/* Authorization Queue */}
          <section className="space-y-4">
            <SectionHeader 
              title="Authorization Queue" 
              subtitle={`${stats?.pending ?? 0} orders waiting`}
              actionLabel="View all"
              onAction={() => navigate("/orders?status=pending_approval")}
            />
            
            <AdaptiveTable
              data={stats?.pendingQueue || []}
              isLoading={isLoading}
              emptyMessage="No orders pending approval."
              onRowClick={(o) => navigate(`/orders/${o.id}`)}
              className="border-slate-100 shadow-sm rounded-2xl"
              columns={[
                {
                  header: "Ref #",
                  accessorKey: "order_number",
                  className: "font-mono font-black text-primary",
                },
                {
                  header: "Shop",
                  render: (o) => o.shop_name || o.shop?.name || "No Shop",
                  className: "font-bold text-slate-900",
                },
                {
                  header: "Amount",
                  accessorKey: "total",
                  className: "text-right font-black tabular-nums text-slate-900 px-6",
                  render: (o) => fmtINR(o.total),
                },
                {
                  header: "Action",
                  id: "action",
                  className: "w-[200px] text-right",
                  render: (o: { id: string }) => (
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        type="button"
                        className="h-9 px-4 rounded-xl text-emerald-600 border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 font-black text-[10px] tracking-wider transition-colors" 
                        onClick={() => decide(o.id, "approved")}
                        disabled={acting === o.id}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 inline-block" />
                        Approve
                      </button>
                      <button 
                        type="button"
                        className="h-9 px-4 rounded-xl text-rose-600 border border-rose-100 bg-rose-50/30 hover:bg-rose-50 font-black text-[10px] tracking-wider transition-colors" 
                        onClick={() => decide(o.id, "rejected")}
                        disabled={acting === o.id}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5 inline-block" />
                        Reject
                      </button>
                    </div>
                  ),
                }
              ]}
              renderMobileCard={(o: { id: string; order_number: string; salesperson_name?: string; shop?: { name: string }; total: number }) => (
                <ListCard 
                  title={o.shop?.name ?? "No Shop"}
                  subtitle={`Ref: #${o.order_number} · ${o.salesperson_name || "Agent"}`}
                  meta={
                    <div className="flex flex-col gap-4 mt-3">
                      <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Amount</span>
                          <span className="text-base font-black text-slate-900">{fmtINR(o.total)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <Button
                          size="sm"
                          className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black text-[11px] tracking-wider shadow-lg shadow-emerald-600/10"
                          disabled={acting === o.id}
                          onClick={(e) => { e.stopPropagation(); decide(o.id, "approved"); }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 rounded-xl font-black text-[11px] tracking-wider text-rose-600 border-rose-100 bg-rose-50/30"
                          disabled={acting === o.id}
                          onClick={(e) => { e.stopPropagation(); decide(o.id, "rejected"); }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  }
                  onClick={() => navigate(`/orders/${o.id}`)}
                />
              )}
            />
          </section>
        </div>

        {/* Side Panel (Right) */}
        <div className="md:col-span-5 lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <SectionHeader title="Top shops — this month" subtitle="Monthly performance" onAction={() => navigate("/reports")} actionLabel="View all" />
            <Card className="border border-slate-100 rounded-2xl bg-card overflow-hidden shadow-sm">
              <CardContent className="p-6">
                {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl mb-3 shimmer" />)}
                <ul className="space-y-1">
                  {stats?.topShops.map((s, i) => (
                    <li key={s.shop_id} className="group flex items-center justify-between rounded-xl p-3 transition-all hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/shops/${s.shop_id}`)}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black",
                          i === 0 ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-100 text-slate-400"
                        )}>
                          {i + 1}
                        </span>
                        <span className="line-clamp-1 font-bold text-slate-700 text-sm">{s.name}</span>
                      </span>
                      <span className="font-black text-primary tabular-nums text-xs ml-2">{fmtINR(s.total)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHeader title="Live Stream" subtitle="Recent activity" actionLabel="View all" onAction={() => navigate("/orders")} />
            <div className="space-y-3">
              {stats?.recent.slice(0, 5).map((o) => (
                <ListCard
                  key={o.id}
                  title={o.shop?.name ?? "—"}
                  subtitle={`#${o.order_number}`}
                  badge={<Badge variant="outline" className={cn("text-[10px] font-black px-2.5 py-0.5 rounded-md border-none shadow-none uppercase tracking-widest", statusColor[o.status as keyof typeof statusColor])}>{statusLabel[o.status as keyof typeof statusLabel]}</Badge>}
                  meta={<div className="text-sm font-black text-slate-900 tracking-tight">{fmtINR(o.total)}</div>}
                  onClick={() => navigate(`/orders/${o.id}`)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

    </div>
  );
}

function Sparkline({ data }: { data: { date: string; total: number }[] }) {
  const { points, dots, max, total } = React.useMemo(() => {
    const vals = data.map(d => d.total);
    const max = Math.max(1, ...vals);
    const w = 400;
    const h = 100;
    const step = data.length > 1 ? w / (data.length - 1) : 0;
    
    const pts = data.map((d, i) => {
      const x = i * step;
      const y = h - (d.total / max) * h;
      return { x, y };
    });

    const pointsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
    const total = vals.reduce((s, d) => s + d, 0);
    
    return { points: pointsStr, dots: pts, max, total };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
          {fmtINR(total)}
        </div>
        <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">
          7-Day Peak: {fmtINR(max)}
        </div>
      </div>
      
      <div className="relative h-20 w-full">
        <svg viewBox="0 0 400 100" className="h-full w-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path fill="url(#sparkGradient)" d={`M0,100 ${points} 400,100 Z`} />
          <polyline fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
          {dots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-white stroke-primary stroke-[2px]" />
          ))}
        </svg>
      </div>

      <div className="flex justify-between border-t border-border/40 pt-2 text-[10px] font-bold text-muted-foreground/40">
        {data.map((d) => (
          <span key={d.date}>{new Date(d.date).toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
        ))}
      </div>
    </div>
  );
}
