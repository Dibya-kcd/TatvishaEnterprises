-- Migration: 20260527000001_fix_salesman_permissions.sql
-- Goal: Restore access for salesmen (anon users) and fix missing schema elements.

-- 1. Ensure warehouse_id exists on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- 2. Restore SELECT permissions for salesmen (anon users)
-- Profiles
DROP POLICY IF EXISTS "profiles_read_all_v8" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_v9" ON public.profiles;
CREATE POLICY "profiles_select_all_v9" ON public.profiles FOR SELECT TO authenticated, anon USING (true);

-- Shops
DROP POLICY IF EXISTS "shops_select_v2" ON public.shops;
DROP POLICY IF EXISTS "shops_select_v3" ON public.shops;
CREATE POLICY "shops_select_v3" ON public.shops FOR SELECT TO authenticated, anon USING (true);

-- Orders
DROP POLICY IF EXISTS "orders_select_v2" ON public.orders;
DROP POLICY IF EXISTS "orders_select_v3" ON public.orders;
CREATE POLICY "orders_select_v3" ON public.orders FOR SELECT TO authenticated, anon USING (true);

-- 3. Create missing get_product_category_counts function
CREATE OR REPLACE FUNCTION public.get_product_category_counts()
RETURNS TABLE(division_category text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(division_category, 'Uncategorized'), COUNT(*)
  FROM public.products
  WHERE is_active = true
  GROUP BY division_category;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_category_counts() TO authenticated, anon;
