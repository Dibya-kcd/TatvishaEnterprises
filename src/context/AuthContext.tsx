import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types";
import { authService, ProfileData } from "@/services/authService";
import { toast } from "sonner";

import { Ctx, AuthCtx } from "./AuthContextCore";

const perfLog = (tag: string, message: string, startTime?: number) => {
  const duration = startTime ? ` (${(performance.now() - startTime).toFixed(1)}ms)` : "";
  console.log(`[Auth:${tag}] ${message}${duration}`);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const initRef = React.useRef(false);

  // useQuery handles Layer 2 & 3 (Profile & Roles)
  const { data: authData, isLoading: loadingData, refetch: refreshRolesData, error: authError } = useQuery({
    queryKey: ["auth-data", user?.id],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      perfLog("Fetcher", `Loading layers for ${user.id}`);
      return await authService.getAuthData(user.id, signal);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    gcTime: 1000 * 60 * 10, // 10 minutes persist
    retry: (failureCount, error: unknown) => {
      // Retry more aggressively for timeouts
      const err = error as Error;
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("timeout") || msg.includes("fetch") || msg.includes("network")) {
        return failureCount < 4;
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(Math.pow(2, attempt) * 1000, 10000),
    meta: {
      errorMessage: "Failed to load security profile"
    }
  });

  React.useEffect(() => {
    if (authError) {
      console.error("[Auth:Error] Profile/Roles loading failed:", authError);
      const isTimeout = authError.message?.toLowerCase().includes("timeout");
      if (isTimeout) {
        toast.error("Database connection is slow. Retrying profile load...", {
          id: "auth-timeout-toast",
          duration: 4000
        });
      }
    }
  }, [authError]);

  const profile = React.useMemo(() => authData?.profile ?? null, [authData?.profile]);
  const roles = React.useMemo(() => authData?.roles ?? [], [authData?.roles]);

  const refreshRoles = async () => {
    await refreshRolesData();
  };

  const setupFirstOwner = async () => {
    if (!user) return false;
    const ok = await authService.setupFirstOwner(user);
    if (ok) await refreshRolesData();
    return ok;
  };

  React.useEffect(() => {
    perfLog("Init", "Starting Auth bootstrap");
    const initStart = performance.now();

    const bootstrap = async () => {
      if (initRef.current) return;
      initRef.current = true;

      try {
        const { session: s, error } = await authService.getSession();
        
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("refresh_token_not_found") || msg.includes("refresh token") || msg.includes("invalid refresh token")) {
            console.warn("[Auth:Init] Refresh token invalid, clearing session.");
            await authService.signOut();
            window.location.reload();
            return;
          }
          throw error;
        }

        if (s?.user) {
          perfLog("Init", `Session found for ${s.user.email}`);
          setSession(s);
          setUser(s.user);
        } else {
          perfLog("Init", "No session");
        }
      } catch (err) {
        console.error("[Auth:Init] Failed:", err);
      } finally {
        setLoading(false);
        perfLog("Init", "Bootstrap done", initStart);
      }
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      perfLog("Event", `${evt}`);
      
      if (evt === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        queryClient.clear(); // Clear all cache on logout
        setLoading(false);
        return;
      }

      if (evt === "SIGNED_IN" || evt === "TOKEN_REFRESHED" || evt === "USER_UPDATED" || evt === "INITIAL_SESSION") {
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          setLoading(false); // Ensure loading is false if we found a user via event
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  React.useEffect(() => {
    if (!user) return;
    const isUserAdmin = roles.includes("admin") || roles.includes("owner") || user.email === "dibyaprakashkcd3@gmail.com";
    if (!isUserAdmin) return;

    const hasSplit = localStorage.getItem("soya_badi_split_v10");
    if (hasSplit) return;

    const runAlignmentAndSplit = async () => {
      try {
        console.log("[Auth] Starting client-side auto-align and split for Soya Badi (Big & Mini) database units and stocks...");
        
        // 1. Align & Rename Standard/Big Sachet
        const { error: err1 } = await supabase
          .from("products")
          .update({
            name: "Soya Chunks Big (Soya Badi) [MRP ₹10 x 10 Unit x 15 Pkt]",
            units_per_packet: 10,
            packets_per_case: 15,
            units_per_case: 150,
            case_qty_value: 150,
            case_qty_unit: "pcs",
            base_unit: "packet",
            is_active: true
          })
          .eq("sku", "BM-FD-SOYCHU-RS10-SC");

        if (err1) {
          console.error("Soya Chunks standard alignment failed:", err1);
        }

        // 2. Align & Activate Mini Sachet
        const { error: err2 } = await supabase
          .from("products")
          .update({
            name: "Soya Chunks Mini (Soya Badi) [MRP ₹10 x 10 Unit x 15 Pkt]",
            units_per_packet: 10,
            packets_per_case: 15,
            units_per_case: 150,
            case_qty_value: 150,
            case_qty_unit: "pcs",
            base_unit: "packet",
            is_active: true
          })
          .eq("sku", "BM-FD-SOYCHUMN-RS10-SC");

        if (err2) {
          console.error("Soya Chunks mini alignment failed:", err2);
        }

        // 3. Update the existing batch for Soya Chunks Big (9b8e987d-2e1d-4a24-8073-92a0bab93db9)
        // Set received_qty to 500 and remaining_qty to 100 (10 packets * 10 units = 100 base units/sachets)
        const { error: errBatchBig } = await supabase
          .from("inventory_batches")
          .update({
            received_qty: 500,
            remaining_qty: 100
          })
          .eq("id", "9b8e987d-2e1d-4a24-8073-92a0bab93db9");

        if (errBatchBig) {
          console.error("Failed to update Big batch:", errBatchBig);
        }

        // 4. Create/Insert the batch for Soya Chunks Mini
        // First check if already exists to prevent RLS/uniqueness errors
        const { data: existingMiniBatch } = await supabase
          .from("inventory_batches")
          .select("id")
          .eq("id", "01e40328-5701-4e4b-a5df-17c52bf2d87b")
          .maybeSingle();

        if (!existingMiniBatch) {
          const { error: errBatchMini } = await supabase
            .from("inventory_batches")
            .insert([{
              id: "01e40328-5701-4e4b-a5df-17c52bf2d87b",
              product_id: "2fd087ca-2006-4d54-b843-9449d1a13e9e",
              batch_number: "PUR/2026/04/1-AUTO-f5ea-mini",
              mfg_date: "2026-04-30",
              expiry_date: "2027-04-30",
              received_qty: 1000,
              remaining_qty: 550, // 3 cases (450) + 10 packets (100) = 550 base units/sachets
              cost_price: 5.5,
              landed_cost: 5.5,
              notes: "Split from standard batch for Mini type",
              purchase_invoice_id: "76a403f4-48aa-47c1-9095-62db4b6c2297",
              unit_of_measure: "CARTOON",
              warehouse_id: "4bd0482b-5b5a-4a3f-9147-521e0814c86c"
            }]);

          if (errBatchMini) {
            console.error("Failed to insert Mini batch:", errBatchMini);
          }
        }

        // 5. Recompute aggregates for both products
        await supabase.rpc('recompute_inventory', { _product_id: "eedd383b-2a3e-4635-b58b-4701977fe2c3" });
        await supabase.rpc('recompute_inventory', { _product_id: "2fd087ca-2006-4d54-b843-9449d1a13e9e" });

        // 6. Mark as successfully aligned and split
        localStorage.setItem("soya_badi_aligned_v6", "true");
        localStorage.setItem("soya_badi_split_v10", "true");

        toast.success("Soya Chunks Big & Mini successfully separated with correct warehouse stocks!", {
          duration: 5000
        });
      } catch (e) {
        console.error("Client identity database alignment and split failed:", e);
      }
    };

    runAlignmentAndSplit();
  }, [user, roles]);

  const value: AuthCtx = {
    user,
    session,
    loading,
    loadingData,
    roles,
    refreshRoles,
    setupFirstOwner,
    profile,
    authError: authError as Error | null,
    isAdmin: roles.includes("admin") || roles.includes("owner"),
    signOut: async () => {
      setSession(null);
      setUser(null);
      queryClient.clear();
      await authService.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


