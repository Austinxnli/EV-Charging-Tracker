/* eslint-env node */
import process from "node:process";

async function supabaseRequest(url, key, method, path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=representation"
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text || null;
  }

  return { ok: response.ok, status: response.status, data: json };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (!supabaseUrl || !serviceRole || !cronSecret) {
    res.status(500).json({ error: "Server is missing required environment variables" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${cronSecret}`;
  if (authHeader !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const resetResult = await supabaseRequest(
    supabaseUrl,
    serviceRole,
    "DELETE",
    "occupancy?select=charger_id"
  );

  if (!resetResult.ok) {
    res.status(resetResult.status).json({ error: "Failed to reset occupancy", details: resetResult.data });
    return;
  }

  const deletedRows = Array.isArray(resetResult.data) ? resetResult.data.length : 0;
  res.status(200).json({ ok: true, releasedCount: deletedRows });
}
