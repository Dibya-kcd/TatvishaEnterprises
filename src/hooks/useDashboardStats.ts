import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useDashboardStats(warehouseId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard-stats", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats", { p_warehouse_id: warehouseId || null });
      if (error) throw error;
      return data as unknown;
    },
    staleTime: 30000, // 30 seconds
  });

  useEffect(() => {
    // Use a unique channel name per-instance to avoid collisions when the hook 
    // is used in multiple components (e.g. AppLayout and Home)
    const instanceId = Math.random().toString(36).substring(7);
    const channel = supabase
      .channel(`dashboard-realtime-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_batches" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
