export type AppRole = "owner" | "admin" | "salesperson";

export const PACK_TYPES = ["pcs", "packet", "case", "kg", "g", "ml", "ltr"] as const;
export type NewOrderPackType = (typeof PACK_TYPES)[number];

export type OrderStatus = "draft" | "pending_approval" | "approved" | "rejected" | "dispatched" | "delivered" | "cancelled";

export type Line = {
  product_id: string;
  name: string;
  sku: string;
  mrp: number;
  unit_price: number;
  gst_rate: number;
  quantity: number;
  stock: number;
  packType: NewOrderPackType;
  item_pack_type?: string | null;
  division_category?: string | null;
  pack_size_value?: number | null;
  pack_size_unit?: string | null;
  case_qty_unit?: string | null;
  case_qty_value?: number | null;
  avg_landed_cost?: number;
  units_per_packet?: number;
  packets_per_case?: number;
  units_per_case?: number;
  unit_type?: "pcs" | "packet" | "kg_g" | null;
  weight_per_unit_grams?: number | null;
  display_weight_unit?: string | null;
  priceSource?: string;
  isLowMargin?: boolean;
  batch_id?: string;
  batch_number?: string;
  is_fifo?: boolean;
  isNew?: boolean;
  isModified?: boolean;
  isRemoved?: boolean;
};

export type PriceTierMap = Record<string, Record<string, Partial<Record<NewOrderPackType, number>>>>;
export type PriceOverrideMap = Record<string, Record<string, Partial<Record<NewOrderPackType, number>>>>;

export type Product = {
  id: string;
  name: string;
  sku: string;
  mrp: number;
  gst_rate: number;
  hsn: string | null;
  min_stock: number;
  is_active: boolean;
  brand: string | null;
  division: string | null;
  division_category: string;
  sub_category: string | null;
  item_pack_type: string | null;
  pack_size_value: number | null;
  pack_size_unit: string | null;
  base_unit: string | null;
  unit: string | null;
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  case_qty_value: number | null;
  case_qty_unit: string | null;
  unit_type: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams: number | null;
  display_weight_unit: "g" | "kg" | "ml" | "ltr" | null;
  preferred_sell_unit: "packet" | "unit" | "case" | "kg" | "g" | "ml" | "l";
  is_mrp_priced: boolean;
  is_chain_item: boolean;
  chain_mrp_label: string | null;
  case_type: string | null;
  base_weight_unit: string | null;
  target_margin_basic: number | null;
  target_margin_premium: number | null;
  target_margin_gold: number | null;
  target_margin_silver: number | null;
  target_margin_bronze: number | null;
  description: string | null;
  image_url: string | null;
  batch_number: string | null;
  inventory?: { stock_base_units: number; avg_landed_cost?: number } | null;
  created_at: string;
  updated_at: string;
};

export type Shop = {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: number;
  is_active: boolean;
  shop_type: "premium" | "gold" | "silver" | "bronze" | "basic";
  discount_pct: number;
};

export type Batch = {
  id: string;
  product_id: string;
  warehouse_id: string | null;
  batch_number: string;
  expiry_date: string;
  mfg_date?: string | null;
  received_qty: number;
  remaining_qty: number;
  cost_price: number;
  landed_cost: number;
  created_at: string;
  warehouse?: { name: string; code?: string } | null;
};

export type StockAudit = {
  id: string;
  warehouse_id: string;
  status: 'draft' | 'completed' | 'cancelled';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  warehouses?: Warehouse;
};

export type StockAuditItem = {
  id: string;
  audit_id: string;
  product_id: string;
  batch_id: string;
  system_qty: number;
  physical_qty: number | null;
  variance: number | null;
  notes: string | null;
  created_at: string;
  product?: Product;
  batch?: Batch;
};

export type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  is_active: boolean;
};

export type WarehouseTransfer = {
  id: string;
  product_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  batch_id: string;
  quantity: number;
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  products?: Product | null;
  from_warehouse?: Warehouse | null;
  to_warehouse?: Warehouse | null;
  batch?: Batch | null;
};
