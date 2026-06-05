import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data, error } = await supabase
    .rpc("get_view_definition", { view_name: "v_product_stock" });

  console.log("View definition:", data);
  console.log("Error:", error);
}

run();
