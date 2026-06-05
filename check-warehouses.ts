import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("*");

  console.log("Warehouses list:", warehouses);
  console.log("Error if any:", error);
}

run();
