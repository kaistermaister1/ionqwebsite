/**
 * Vercel Serverless Function: /api/proxy
 *
 * Used by `web_client.html` to avoid browser CORS by proxying requests
 * to the game API through the same origin.
 *
 * Query params:
 * - base: https://example.com   (required)
 * - path: /v1/graph            (required)
 *
 * Supports GET/POST and forwards Authorization header.
 */

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function isAllowedBase(base) {
  try {
    const u = new URL(base);
    if (u.protocol !== "https:") return false;
    // Basic safety: prevent obvious SSRF to localhost/private networks.
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  // CORS preflight (not strictly needed for same-origin, but harmless)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const { base, path } = req.query || {};
  if (!base || !path) return json(res, 400, { ok: false, error: { message: "Missing base or path" } });
  if (!isAllowedBase(String(base))) return json(res, 400, { ok: false, error: { message: "Invalid base URL" } });

  const p = String(path);
  if (!p.startsWith("/")) return json(res, 400, { ok: false, error: { message: "path must start with /" } });

  const target = new URL(String(base).replace(/\/$/, "") + p);

  const headers = {};
  const auth = req.headers?.authorization;
  if (auth) headers.Authorization = auth;
  if (req.method === "POST") headers["Content-Type"] = "application/json";

  let body = undefined;
  if (req.method === "POST") {
    // Vercel parses JSON body by default when Content-Type is application/json.
    body = req.body ? JSON.stringify(req.body) : "{}";
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers,
      body,
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.end(text);
  } catch (e) {
    return json(res, 502, { ok: false, error: { message: e?.message || "Proxy request failed" } });
  }
};

