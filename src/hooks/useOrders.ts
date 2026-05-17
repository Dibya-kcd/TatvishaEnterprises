import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOrders(search: string, category: string, isAdmin: boolean, userId?: string, salespersonId?: string) {
  const pageSize = 50;
  
  return useInfiniteQuery({
    queryKey: ["orders", search, category, isAdmin, userId, salespersonId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("v_orders_expanded")
        .select("id, order_number, status, total, created_at, order_date, is_void, is_over_limit, shop_name, salesperson_name, salesperson_id", { count: 'exact' })
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search) {
        query = query.or(`order_number.ilike.%${search}%,shop_name.ilike.%${search}%,salesperson_name.ilike.%${search}%`);
      }

      if (category !== "All") {
        let status = category.toLowerCase().replace(" ", "_");
        if (status === "pending") status = "pending_approval";
        query = query.eq("status", status);
      }

      if (!isAdmin && userId) {
        query = query.eq("salesperson_id", userId);
      } else if (salespersonId && salespersonId !== "all") {
        query = query.eq("salesperson_id", salespersonId);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data, count, nextPage: data.length === pageSize ? pageParam + 1 : undefined };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
}
