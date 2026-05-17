import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export function useProductsCatalog(search?: string, category?: string, showInactive?: boolean, sort?: string, packType?: string) {
  return useInfiniteQuery({
    queryKey: ["products-catalog", search, category, showInactive, sort, packType],
    queryFn: async ({ pageParam = 0 }) => {
      const pageSize = 20;
      let query = supabase
        .from("v_product_stock")
        .select(`
          id,
          name,
          sku,
          mrp,
          gst_rate,
          hsn,
          min_stock,
          is_active,
          division_category,
          unit_type,
          item_pack_type,
          packets_per_case,
          units_per_packet,
          units_per_case,
          preferred_sell_unit,
          is_chain_item,
          is_mrp_priced,
          brand,
          stock_base_units,
          avg_landed_cost,
          division,
          batch_number,
          pack_size_value,
          pack_size_unit,
          base_weight_unit,
          case_qty_unit,
          unit,
          base_unit,
          weight_per_unit_grams,
          display_weight_unit,
          chain_mrp_label,
          target_margin_basic,
          target_margin_bronze,
          target_margin_silver,
          target_margin_gold,
          target_margin_premium
        `, { count: 'exact' });

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }

      if (category && category !== "All") {
        query = query.eq("division_category", category);
      }

      if (!showInactive) {
        query = query.eq("is_active", true);
      }

      if (packType && packType !== "All") {
        query = query.eq("item_pack_type", packType.toLowerCase());
      }

      // Apply sorting
      if (sort === 'Stock (High)') {
        query = query.order('stock_base_units', { ascending: false });
      } else if (sort === 'Stock (Low)') {
        query = query.order('stock_base_units', { ascending: true });
      } else if (sort === 'Z-A') {
        query = query.order('name', { ascending: false });
      } else {
        query = query.order('name', { ascending: true });
      }

      const { data, error, count } = await query
        .range(pageParam, pageParam + pageSize - 1);

      if (error) throw error;

      return {
        data: (data || []).map(item => ({
          ...item,
          inventory: { 
            quantity: item.stock_base_units, 
            avg_landed_cost: item.avg_landed_cost 
          }
        })),
        count: count || 0,
        nextPage: (data?.length || 0) === pageSize ? pageParam + pageSize : undefined
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
