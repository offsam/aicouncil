import { createClient } from "@supabase/supabase-js";

async function testConn() {
  const url = "https://luedxkjamlsfqvgvfaqi.supabase.co";
  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1ZWR4a2phbWxzZnF2Z3ZmYXFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjE2MzIxNiwiZXhwIjoyMDk3NzM5MjE2fQ.wRcLWuiqZT1TfE54VltgpDobo_eUZc4v6P7i4MTqcO0";
  
  const supabase = createClient(url, key);
  
  console.log("Checking if 'entity_registry' exists...");
  const { data: reg, error: regErr } = await supabase.from("entity_registry").select("*").limit(1);
  if (regErr) {
    console.log("Error querying entity_registry:", regErr.message);
  } else {
    console.log("Success! entity_registry exists. Data:", reg);
  }

  console.log("Checking if 'chambers' exists...");
  const { data: cham, error: chamErr } = await supabase.from("chambers").select("*").limit(1);
  if (chamErr) {
    console.log("Error querying chambers:", chamErr.message);
  } else {
    console.log("Success! chambers exists. Data:", cham);
  }
}

testConn().catch(console.error);
