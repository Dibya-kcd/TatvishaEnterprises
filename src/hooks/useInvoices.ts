import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useInvoices(search: string, category: string) {
  const pageSize = 50;
  
  return useInfiniteQuery({
    queryKey: ["invoices", search, category],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("v_invoices_expanded")
        .select(`
          id,
          invoice_number,
          payment_status,
          type,
          total,
          amount_paid,
          is_void,
          created_at,
          order_number,
          order_status,
          order_date,
          shop_name,
          shop_id,
          order_id
        `, { count: 'exact' })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (category === "unpaid") {
        query = query.eq("payment_status", "unpaid").eq("is_void", false);
      } else if (category === "partial") {
        query = query.eq("payment_status", "partial").eq("is_void", false);
      } else if (category === "paid") {
        query = query.eq("payment_status", "paid").eq("is_void", false);
      } else if (category === "void") {
        query = query.eq("is_void", true);
      } else {
        query = query.eq("is_void", false);
      }

      if (search) {
        query = query.or(`invoice_number.ilike.%${search}%,shop_name.ilike.%${search}%,order_number.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      return { 
        data: data || [], 
        count, 
        nextPage: (data?.length || 0) === pageSize ? pageParam + 1 : undefined 
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 30000,
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ is_void: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
