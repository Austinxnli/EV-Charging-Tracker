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

function createAdminToken(secret, ttlMs = 8 * 60 * 60 * 1000) {
  const payload = {
    role: "admin",
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(8).toString("hex")
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const adminPass = process.env.ADMIN_PASS;
  if (!adminPass) {
    res.status(500).json({ error: "Server admin password is not configured" });
    return;
  }

  const { password } = parseJsonBody(req);
  if (!password || password !== adminPass) {
    res.status(401).json({ error: "Incorrect passcode" });
    return;
  }

  const secret = process.env.ADMIN_SESSION_SECRET || adminPass;
  const token = createAdminToken(secret);

  res.status(200).json({
    token,
    expiresInSeconds: 8 * 60 * 60
  });
}
