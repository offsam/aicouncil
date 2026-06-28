import { createClient } from "@supabase/supabase-js";

async function queryRoutingDescription() {
  const url = "https://luedxkjamlsfqvgvfaqi.supabase.co";
  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1ZWR4a2phbWxzZnF2Z3ZmYXFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjE2MzIxNiwiZXhwIjoyMDk3NzM5MjE2fQ.wRcLWuiqZT1TfE54VltgpDobo_eUZc4v6P7i4MTqcO0";
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .neq("routing_description", null)
    .limit(20);
  if (error) {
    console.error("Error querying routing_description:", error.message);
    return;
  }
  console.log("Rows with routing_description (up to 20):", data);
}

queryRoutingDescription().catch(console.error);
