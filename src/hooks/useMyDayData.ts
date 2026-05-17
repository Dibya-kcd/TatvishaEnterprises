import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MyDayData = {
  todaySales: number;
  todayDelivered: number;
  pendingApproval: number;
  approved: number;
  inTransit: number;
  outstanding: number;
  myShops: { id: string; name: string; phone: string | null }[];
  todayOrders: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
    shop: { name: string } | null;
  }[];
  recentApprovals: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    approved_at: string | null;
    shop: { name: string } | null;
  }[];
};

export function useMyDayData(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-day', userId],
    queryFn: async () => {
      if (!userId) throw new Error("User not authenticated");

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isoToday = today.toISOString();
      const dateToday = isoToday.split('T')[0];

      const [todayOrdersRes, pendingRes, approvedRes, dispatchedRes, recentApprovalsRes, shopsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, total, created_at, order_date, delivered_at, dispatched_at, shop:shops(name)")
          .eq("salesperson_id", userId)
          .or(`created_at.gte.${isoToday},order_date.eq.${dateToday},delivered_at.gte.${isoToday},dispatched_at.gte.${isoToday}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "pending_approval"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "approved"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "dispatched"),
        supabase
          .from("orders")
          .select("id, order_number, status, total, approved_at, shop:shops(name)")
          .eq("salesperson_id", userId)
          .in("status", ["approved", "rejected"])
          .order("approved_at", { ascending: false, nullsFirst: false })
          .limit(3),
        supabase.from("orders")
          .select("shop:shops(id, name, phone)")
          .eq("salesperson_id", userId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const { data: invs } = await supabase
        .from("invoices")
        .select("total, amount_paid, order:orders!inner(salesperson_id)")
        .eq("order.salesperson_id", userId)
        .eq("is_void", false)
        .neq("payment_status", "paid");
      
      const outstanding = (invs ?? []).reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0);

      const orders = (todayOrdersRes.data ?? []);
      const deliveredToday = orders.filter((o) => 
        (o.status === "delivered" && o.delivered_at && o.delivered_at >= isoToday) || 
        (o.status === "dispatched" && o.dispatched_at && o.dispatched_at >= isoToday)
      );
      const todaySales = deliveredToday.reduce((s, o) => s + Number(o.total || 0), 0);

      const myShopsRaw = (shopsRes.data ?? [])
        .map(o => o.shop as { id: string; name: string; phone: string | null })
        .filter(Boolean);
      const myShops = Array.from(new Map(myShopsRaw.map(s => [s.id, s])).values());

      return {
        todaySales,
        todayDelivered: deliveredToday.length,
        pendingApproval: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        inTransit: dispatchedRes.count ?? 0,
        outstanding,
        myShops: myShops as MyDayData["myShops"],
        todayOrders: orders as MyDayData["todayOrders"],
        recentApprovals: (recentApprovalsRes.data ?? []) as MyDayData["recentApprovals"],
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
