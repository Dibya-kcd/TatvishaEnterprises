import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Batch, Product } from "@/types";

export function useRecommendedBatches(warehouseId?: string, search?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["recommended-batches", warehouseId, search],
    queryFn: async ({ pageParam = 0 }) => {
      if (!warehouseId || warehouseId === "null") return { data: [], nextPage: undefined };

      const pageSize = 50;
      let query = supabase
        .from("v_inventory_batch_details")
        .select("*")
        .eq("warehouse_id", warehouseId)
        .gt("remaining_qty", 0)
        .order("expiry_date", { ascending: true })
        .order("received_at", { ascending: true })
        .range(pageParam, pageParam + pageSize - 1);

      if (search) {
        query = query.or(`product_name.ilike.%${search}%,product_sku.ilike.%${search}%,batch_number.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const results = (data ?? []).map((x) => ({
        ...x,
        // Map flat view fields back to nested structure to match Product type if needed 
        // or just use as is in Batch context.
        product: {
          id: x.product_id,
          name: x.product_name,
          sku: x.product_sku,
          mrp: x.product_mrp,
          division_category: x.product_division_category,
          item_pack_type: x.product_item_pack_type,
          units_per_packet: x.product_units_per_packet,
          packets_per_case: x.product_packets_per_case,
          pack_size_value: x.product_pack_size_value,
          pack_size_unit: x.product_pack_size_unit,
          unit_type: x.product_unit_type,
          units_per_case: x.product_units_per_case,
        } as unknown as Product
      } as unknown as Batch));

      return {
        data: results,
        nextPage: results.length === pageSize ? pageParam + pageSize : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: enabled && !!warehouseId && warehouseId !== "null",
  });
}
