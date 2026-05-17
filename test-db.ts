import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data: routeData, error: routeError } = await supabase.from('beat_routes').select('*').limit(1);
  if (routeError) {
    console.log("Error checking beat_routes:", routeError.message);
  } else {
    console.log("beat_routes exists. First row:", routeData);
  }
}

checkTable();
