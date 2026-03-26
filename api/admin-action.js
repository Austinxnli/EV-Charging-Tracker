/* eslint-env node */
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function verifyAdminToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payloadB64, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (sig !== expected) return false;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (payload.role !== "admin") return false;
  if (!payload.exp || Date.now() > payload.exp) return false;
  return true;
}

async function supabaseRequest(url, key, method, path, body) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
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
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminPass = process.env.ADMIN_PASS;
  const secret = process.env.ADMIN_SESSION_SECRET || adminPass;

  if (!supabaseUrl || !serviceRole || !secret) {
    res.status(500).json({ error: "Server is missing required environment variables" });
    return;
  }

  const { token, action, spotId, isActive, currentHour, waitlistId } = parseJsonBody(req);
  if (!verifyAdminToken(token, secret)) {
    res.status(401).json({ error: "Admin session expired. Please unlock admin mode again." });
    return;
  }

  if (action === "releaseSpot") {
    if (!Number.isInteger(spotId)) {
      res.status(400).json({ error: "Invalid charger id" });
      return;
    }

    const releaseResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "DELETE",
      `occupancy?charger_id=eq.${spotId}`
    );

    if (!releaseResult.ok) {
      res.status(releaseResult.status).json({ error: "Failed releasing spot", details: releaseResult.data });
      return;
    }

    const waitlistResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "GET",
      "waitlist?select=id,user_name,owner_id,end_h&order=joined_at.asc&limit=1"
    );

    if (!waitlistResult.ok) {
      res.status(waitlistResult.status).json({ error: "Spot released, but failed loading waitlist", details: waitlistResult.data });
      return;
    }

    const rows = Array.isArray(waitlistResult.data) ? waitlistResult.data : [];
    if (rows.length === 0) {
      res.status(200).json({ ok: true, assigned: false });
      return;
    }

    const next = rows[0];
    if (!next.owner_id) {
      res.status(200).json({ ok: true, assigned: false, reason: "missing_owner_id" });
      return;
    }

    const nowHour = Number.isInteger(currentHour) ? currentHour : new Date().getHours();
    const assignResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "POST",
      "occupancy",
      {
        charger_id: spotId,
        user_name: next.user_name,
        owner_id: next.owner_id,
        start_h: nowHour,
        end_h: next.end_h,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    );

    if (!assignResult.ok) {
      // Spot release already succeeded. Return warning (200) so UI can reflect partial success.
      res.status(200).json({
        ok: true,
        assigned: false,
        reason: "assign_failed",
        details: assignResult.data
      });
      return;
    }

    const removeWaitlistResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "DELETE",
      `waitlist?id=eq.${next.id}`
    );

    if (!removeWaitlistResult.ok) {
      // Assignment succeeded. Return warning so UI doesn't show hard error for completed release.
      res.status(200).json({
        ok: true,
        assigned: true,
        assignedName: next.user_name,
        reason: "waitlist_remove_failed",
        details: removeWaitlistResult.data
      });
      return;
    }

    res.status(200).json({ ok: true, assigned: true, assignedName: next.user_name });
    return;
  }

  if (action === "removeWaitlistEntry") {
    if (!Number.isInteger(waitlistId)) {
      res.status(400).json({ error: "Invalid waitlist id" });
      return;
    }

    const removeResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "DELETE",
      `waitlist?id=eq.${waitlistId}`
    );

    if (!removeResult.ok) {
      res.status(removeResult.status).json({ error: "Failed removing waitlist entry", details: removeResult.data });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  if (action !== "toggleMaintenance") {
    res.status(400).json({ error: "Unsupported admin action" });
    return;
  }

  if (!Number.isInteger(spotId)) {
    res.status(400).json({ error: "Invalid charger id" });
    return;
  }

  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "Invalid maintenance state" });
    return;
  }

  const updateResult = await supabaseRequest(
    supabaseUrl,
    serviceRole,
    "PATCH",
    `maintenance?charger_id=eq.${spotId}`,
    { is_active: isActive, updated_at: new Date().toISOString() }
  );

  if (!updateResult.ok) {
    res.status(updateResult.status).json({ error: "Failed updating maintenance", details: updateResult.data });
    return;
  }

  const updateRows = Array.isArray(updateResult.data) ? updateResult.data : [];
  if (updateRows.length === 0) {
    const insertResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "POST",
      "maintenance",
      { charger_id: spotId, is_active: isActive, updated_at: new Date().toISOString() }
    );

    if (!insertResult.ok) {
      res.status(insertResult.status).json({ error: "Failed inserting maintenance", details: insertResult.data });
      return;
    }
  }

  if (isActive) {
    const releaseResult = await supabaseRequest(
      supabaseUrl,
      serviceRole,
      "DELETE",
      `occupancy?charger_id=eq.${spotId}`
    );

    if (!releaseResult.ok) {
      res.status(releaseResult.status).json({ error: "Maintenance updated, but release failed", details: releaseResult.data });
      return;
    }
  }

  res.status(200).json({ ok: true });
}
