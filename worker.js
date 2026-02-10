export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");

    // === CONFIGURAÇÃO DE CORS ===
    const ALLOWED_ORIGINS = [
      "https://seusite.com",
      "*",
    ];

    const corsHeaders = {};
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      corsHeaders["Access-Control-Allow-Origin"] = origin;
      corsHeaders["Vary"] = "Origin";
    }

    corsHeaders["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    corsHeaders["Access-Control-Allow-Headers"] = "Range, Content-Type";
    corsHeaders["Access-Control-Expose-Headers"] =
      "Content-Length, Content-Range";

    // === PREFLIGHT ===
    if (request.method === "OPTIONS") {
      console.log("[CORS] Preflight request");
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // === APENAS GET ===
    if (request.method !== "GET") {
      console.log("[BLOCK] Método não permitido:", request.method);
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const cache = caches.default;
    const key = url.pathname.replace(/^\/+/, "");

    console.log("[REQUEST]", {
      url: url.toString(),
      key,
      range: request.headers.get("Range") || "none"
    });

    if (!key) {
      console.log("[ERROR] Arquivo não informado");
      return new Response("Arquivo não informado", {
        status: 400,
        headers: corsHeaders
      });
    }

    // === CACHE FIRST ===
    const cached = await cache.match(request);
    if (cached) {
      console.log("[CACHE HIT]");
      return new Response(cached.body, {
        status: cached.status,
        headers: mergeHeaders(cached.headers, corsHeaders)
      });
    }

    console.log("[CACHE MISS] Buscando no bucket");

    // === RANGE ===
    const rangeHeader = request.headers.get("Range");

    const object = await env.MY_BUCKET.get(key, {
      range: rangeHeader
        ? { header: rangeHeader }
        : undefined
    });

    if (!object) {
      console.log("[NOT FOUND]", key);
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders
      });
    }

    // === HEADERS ===
    const headers = new Headers();
    object.writeHttpMetadata(headers);

    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream"
    );

    headers.set("Cache-Control", "public, max-age=600");

    if (object.range) {
      headers.set(
        "Content-Range",
        `bytes ${object.range.offset}-${object.range.end}/${object.size}`
      );
      headers.set("Accept-Ranges", "bytes");
    }

    // Aplica CORS
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }

    const status = object.range ? 206 : 200;

    const response = new Response(object.body, {
      status,
      headers
    });

    console.log("[RESPONSE]", {
      status,
      cached: false,
      range: !!object.range
    });

    // === STORE CACHE ===
    ctx.waitUntil(cache.put(request, response.clone()));

    return response;
  }
};

// Mescla headers do cache com CORS
function mergeHeaders(original, extra) {
  const headers = new Headers(original);
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v);
  }
  return headers;
}
