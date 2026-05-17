import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Generate a unique storage key based on the project URL to prevent 
// "Invalid Refresh Token" errors when multiple projects use the same origin (localhost)
const storageKey = supabaseUrl && !supabaseUrl.includes("placeholder")
  ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` 
  : 'supabase.auth.token';

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder") || supabaseKey.includes("placeholder")) {
  const errorMsg = "Supabase configuration is missing or contains placeholder values. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment variables.";
  console.error(errorMsg);
  // In a real app, we might throw or render a fallback, but here we'll ensure the client 
  // creation doesn't crash the build even if variables are missing during CI/etc.
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co", 
  supabaseKey || "placeholder",
  {
    auth: {
      storageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    }
  }
);

// Basic health check to detect configuration issues early
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Supabase Connectivity Error:", error);
    } else {
      console.info("Supabase connected successfully. Session status:", !!data.session);
    }
  }).catch(err => {
    console.error("Supabase unreachable:", err);
  });
}
