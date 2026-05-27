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

async function testRevert() {
  const orderId = '7e4403d7-a8de-41e0-9067-169eb40f16f6';
  console.log("Calling revert_order_to_approved for order:", orderId);
  const { data, error } = await supabase.rpc('revert_order_to_approved', { p_order_id: orderId });
  console.log("Error:", error);
  console.log("Data result:", data);
}

testRevert();
