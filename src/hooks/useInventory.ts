import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InventoryBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  remaining_qty: number;
  warehouse_id: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    mrp: number;
    min_stock: number;
    units_per_packet: number;
    packets_per_case: number;
    item_pack_type: string;
    division_category: string;
    pack_size_value?: number;
    pack_size_unit?: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string | null;
  };
  mfg_date?: string | null;
  cost_price?: number;
  landed_cost?: number | null;
  received_qty?: number;
  received_at?: string;
  notes?: string | null;
}

export function useInventory(search: string, warehouseId: string, category: string) {
  return useInfiniteQuery({
    queryKey: ["inventory", search, warehouseId, category],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const pageSize = 50;
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("v_inventory_batch_details")
        .select(`
          id,
          product_id,
          batch_number,
          expiry_date,
          remaining_qty,
          warehouse_id,
          product_name,
          product_sku,
          product_mrp,
          product_min_stock,
          product_units_per_packet,
          product_packets_per_case,
          product_item_pack_type,
          product_division_category,
          product_pack_size_value,
          product_pack_size_unit,
          warehouse_name,
          warehouse_code,
          mfg_date,
          cost_price,
          landed_cost,
          received_qty,
          received_at,
          notes
        `, { count: 'exact' });

      if (warehouseId && warehouseId !== "all") {
        query = query.eq("warehouse_id", warehouseId);
      }

      if (search) {
        query = query.or(`batch_number.ilike.%${search}%,product_name.ilike.%${search}%,product_sku.ilike.%${search}%`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(); 
      in30.setDate(in30.getDate() + 30);
      const in30Iso = in30.toISOString().slice(0, 10);

      if (category === "Active") {
        query = query.gt("remaining_qty", 0).gte("expiry_date", today);
      } else if (category === "Expiring") {
        query = query.gt("remaining_qty", 0).gte("expiry_date", today).lte("expiry_date", in30Iso);
      } else if (category === "Expired") {
        query = query.lt("expiry_date", today);
      }

      const { data, error, count } = await query
        .order("expiry_date", { ascending: true })
        .range(from, to);

      if (error) throw error;
      
      const transformed = (data || []).map(d => ({
        id: d.id,
        product_id: d.product_id,
        batch_number: d.batch_number,
        expiry_date: d.expiry_date,
        remaining_qty: d.remaining_qty || 0,
        warehouse_id: d.warehouse_id,
        mfg_date: d.mfg_date,
        cost_price: d.cost_price,
        landed_cost: d.landed_cost,
        received_qty: d.received_qty,
        received_at: d.received_at,
        notes: d.notes,
        product: {
          id: d.product_id,
          name: d.product_name || 'Unknown Product',
          sku: d.product_sku || 'NO-SKU',
          mrp: d.product_mrp,
          min_stock: d.product_min_stock,
          units_per_packet: d.product_units_per_packet,
          packets_per_case: d.product_packets_per_case,
          item_pack_type: d.product_item_pack_type,
          division_category: d.product_division_category,
          pack_size_value: d.product_pack_size_value,
          pack_size_unit: d.product_pack_size_unit,
        },
        warehouse: d.warehouse_id ? {
          id: d.warehouse_id,
          name: d.warehouse_name || 'Unknown Warehouse',
          code: d.warehouse_code,
        } : undefined
      }));

      return { 
        data: transformed as InventoryBatch[], 
        count: count || 0,
        nextPage: (data?.length || 0) < pageSize ? undefined : pageParam + 1
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 1000 * 60 * 5,
  });
}
