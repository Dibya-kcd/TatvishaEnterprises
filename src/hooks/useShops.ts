import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useShops(showInactive: boolean = false) {
  return useQuery({
    queryKey: ["shops", showInactive],
    queryFn: async () => {
      let query = supabase.from("shops").select("*").order("name");
      if (!showInactive) {
        query = query.eq("is_active", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
