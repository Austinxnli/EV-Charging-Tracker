import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;

console.log("VITE_SUPABASE_URL", supabaseUrl);
console.log("VITE_SUPABASE_KEY", supabaseAnonKey ? `${supabaseAnonKey.slice(0, 10)}...` : undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("supabase env missing", { supabaseUrl, supabaseAnonKey });
  // Throwing here is fine, but we can avoid a silent blank state.
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
