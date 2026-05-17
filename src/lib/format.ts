export const fmtINR = (n: number | string | null | undefined) => {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? 0));
  if (isNaN(v) || !isFinite(v)) return "Rs. 0.00";
  const absV = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("en-IN", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(absV);
  return `${sign}Rs. ${formatted}`;
};

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export const fmtCompactINR = (n: number | string | null | undefined) => {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? 0));
  if (isNaN(v) || !isFinite(v)) return "Rs. 0";
  const absV = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  
  let formatted = "";
  if (absV >= 10000000) formatted = `${(absV / 10000000).toFixed(1)}Cr`;
  else if (absV >= 100000) formatted = `${(absV / 100000).toFixed(1)}L`;
  else if (absV >= 1000) formatted = `${(absV / 1000).toFixed(1)}K`;
  else formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(absV);
  
  return `${sign}Rs. ${formatted}`;
};

export const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-status-pending/10 text-status-pending border border-status-pending/20",
  approved: "bg-status-approved/10 text-status-approved border border-status-approved/20",
  rejected: "bg-destructive/10 text-destructive border border-destructive/20",
  dispatched: "bg-status-dispatched/10 text-status-dispatched border border-status-dispatched/20",
  delivered: "bg-status-delivered/10 text-status-delivered border border-status-delivered/20",
  cancelled: "bg-status-cancelled/10 text-status-cancelled border border-status-cancelled/20",
};

export const payStatusLabel: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  void: "Cancelled",
};

export const payStatusColor: Record<string, string> = {
  unpaid: "bg-destructive/10 text-destructive border border-destructive/20",
  partial: "bg-status-pending/15 text-status-pending border border-status-pending/30",
  paid: "bg-status-delivered/15 text-status-delivered border border-status-delivered/30",
  void: "bg-muted text-muted-foreground",
};

export const formatPackLabel = (packType: string | null | undefined, fallback: string = "PCS") => {
  if (!packType) return fallback;
  const t = packType.toLowerCase();
  
  if (t === "case" || t === "carton" || t === "box" || t === "bag" || t === "ocs") return "Case";
  if (t === "packet" || t === "pkt" || t === "pack" || t === "pag") return "Packet";
  if (t === "pcs" || t === "unit" || t === "pc" || t === "pouch" || t === "sachet") return "PCS";
  if (t === "kg") return "Kg";
  
  // Title case fallback
  return packType.charAt(0).toUpperCase() + packType.slice(1);
};

export const CATEGORY_LABELS: Record<string, string> = {
  "BASIC SPICES": "Basic spices",
  "BLENDED SPICES": "Blended spices",
  "WHOLE SPICES": "Whole spices",
  "PROCESS ITEMS": "Process spices",
  "FOOD ITEMS": "Food Items",
  "KETCHUP": "Ketchup",
  "PASTA ITEMS": "Pasta Items",
  "CHAIN": "Chain",
  "OTHER": "Other",
};

export function formatDivisionCategory(value?: string | null) {
  if (!value) return "Other";
  const normalized = value.trim().toUpperCase();
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];
  
  // Custom mapping for cases where DB value might be different
  const mappings: Record<string, string> = {
    "BASIC": "Basic spices",
    "BLENDED": "Blended spices",
    "WHOLE": "Whole spices",
    "PROCESS": "Process spices",
    "FOOD": "Food Items",
    "PASTA": "Pasta Items",
  };
  
  if (mappings[normalized]) return mappings[normalized];

  // Title case fallback
  return normalized.split(' ').map(word => 
    word.charAt(0) + word.slice(1).toLowerCase()
  ).join(' ');
}

export const friendlyError = (err: unknown) => {
  if (!err) return "Unknown error occurred";
  if (typeof err === "string") return err;
  
  const error = err as { message?: string; details?: string; hint?: string };
  
  // Supabase/PostgREST error objects
  if (error.message && typeof error.message === "string") {
    const msg = error.message;
    if (msg.includes("JWT")) return "Your session has expired. Please log in again.";
    if (msg.includes("check_balance_limit")) return "Shop has exceeded its credit limit.";
    if (msg.includes("check_inventory_exists")) return "Insufficient inventory in warehouse.";
    if (msg.includes("foreign key constraint")) return "Operation failed: Related record does not exist.";
    if (msg.includes("permission denied")) return "You don't have permission to perform this action.";
    return msg;
  }
  
  if (error.details && typeof error.details === "string") return error.details;
  if (error.hint && typeof error.hint === "string") return error.hint;
  
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};
