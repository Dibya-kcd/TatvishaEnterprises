import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .limit(5);

  const { data: userRoles, error: rErr } = await supabase
    .from("user_roles")
    .select("*")
    .limit(5);

  console.log("Some profiles:", profiles);
  console.log("Some user_roles:", userRoles);
}

run();
