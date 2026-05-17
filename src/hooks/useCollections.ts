import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecentPayment = {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  invoice: {
    invoice_number: string;
    shop: {
      name: string;
    } | null;
  } | null;
};

export type ShopOutstanding = {
  shop_id: string;
  shop_name: string;
  total_outstanding: number;
  invoice_count: number;
  last_order_at: string | null;
};

export function useCollections(userId: string | undefined, isAdmin: boolean) {
  return useQuery({
    queryKey: ['collections', userId, isAdmin],
    queryFn: async () => {
      if (!userId) return { outstandings: [], recentPayments: [], totalOutstanding: 0 };

      // 1. Fetch all unpaid/partial invoices with shop info
      let query = supabase
        .from("invoices")
        .select(`
          total, 
          amount_paid, 
          shop_id, 
          created_at,
          payment_status,
          shop:shops!invoices_shop_id_fkey (
            name
          ),
          order:orders!inner (
            shop_id,
            salesperson_id,
            shop:shops (name)
          )
        `)
        .neq("payment_status", "paid")
        .eq("is_void", false);

      if (!isAdmin) {
        query = query.eq("order.salesperson_id", userId);
      }

      const { data: invs, error: invError } = await query;
      if (invError) throw invError;

      // Aggregate by shop
      const shopMap = new Map<string, ShopOutstanding>();
      let overallTotal = 0;

      invs?.forEach(inv => {
        const actualShopId = inv.shop_id || (inv.order as { shop_id?: string } | null)?.shop_id;
        if (!actualShopId) return;
        
        const outstanding = Number(inv.total) - Number(inv.amount_paid);
        if (outstanding <= 0) return; 

        overallTotal += outstanding;
        const shopName = inv.shop?.name || (inv.order as { shop: { name: string } } | null)?.shop?.name || "Unknown Shop";

        const existing = shopMap.get(actualShopId) || {
          shop_id: actualShopId,
          shop_name: shopName,
          total_outstanding: 0,
          invoice_count: 0,
          last_order_at: null
        };

        existing.total_outstanding += outstanding;
        existing.invoice_count += 1;
        if (!existing.last_order_at || new Date(inv.created_at) > new Date(existing.last_order_at)) {
          existing.last_order_at = inv.created_at;
        }

        shopMap.set(actualShopId, existing);
      });

      const outstandings = Array.from(shopMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);

      // 2. Recent payments
      let payQuery = supabase
        .from("payments")
        .select(`
          id,
          amount,
          paid_at,
          method,
          invoice:invoices!inner (
            invoice_number,
            shop:shops!invoices_shop_id_fkey (
              name
            ),
            order:orders!inner (
              salesperson_id,
              shop:shops (name)
            )
          )
        `)
        .order("paid_at", { ascending: false })
        .limit(20);

      if (!isAdmin) {
        payQuery = payQuery.eq("invoice.order.salesperson_id", userId);
      }

      const { data: pays, error: payError } = await payQuery;
      if (payError) throw payError;

      return {
        outstandings,
        recentPayments: pays as unknown as RecentPayment[],
        totalOutstanding: overallTotal
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
