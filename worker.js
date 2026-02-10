export default {
  async fetch(request, env, ctx) {
    // ======================
    // CORS (simples e correto)
    // ======================
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range"
    };

    // ======================
    // PREFLIGHT
    // ======================
    if (request.method === "OPTIONS") {
      console.log("[CORS] Preflight");
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ======================
    // MÉTODO
    // ======================
    if (request.method !== "GET") {
      console.log("[BLOCK] Method:", request.method);
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const cache = caches.default;

    // ======================
    // KEY NO R2
    // URL: /audios/arquivo.mp3
    // R2:  arquivo.mp3
    // ======================
    const key = url.pathname.replace(/^\/audios\//, "");

    if (!key) {
      console.log("[ERROR] Arquivo não informado");
      return new Response("Arquivo não informado", {
        status: 400,
        headers: corsHeaders
      });
    }

    const rangeHeader = request.headers.get("Range");

    console.log("[REQUEST]", {
      url: url.toString(),
      key,
      range: rangeHeader || "none"
    });

    // ======================
    // VALIDA RANGE
    // ======================
    if (rangeHeader && !/^bytes=\d*-\d*$/.test(rangeHeader)) {
      console.log("[INVALID RANGE]", rangeHeader);
      return new Response("Invalid Range", {
        status: 416,
        headers: corsHeaders
      });
    }

    // ======================
    // CACHE FIRST (somente sem Range)
    // ======================
    if (!rangeHeader) {
      const cached = await cache.match(request);
      if (cached) {
        console.log("[CACHE HIT] Arquivo inteiro");
        return addCors(cached, corsHeaders);
      }
    }

    console.log("[CACHE MISS] Buscando no R2");

    // ======================
    // GET NO R2
    // ======================
    const object = await env.MY_BUCKET.get(key, {
      range: rangeHeader ? { header: rangeHeader } : undefined
    });

    if (!object) {
      console.log("[NOT FOUND]", key);
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders
      });
    }

    // ======================
    // HEADERS
    // ======================
    const headers = new Headers();
    object.writeHttpMetadata(headers);

    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream"
    );

    headers.set("Cache-Control", "public, max-age=600");
    headers.set("Accept-Ranges", "bytes");

    if (object.range) {
      headers.set(
        "Content-Range",
        `bytes ${object.range.offset}-${object.range.end}/${object.size}`
      );
    }

    // CORS
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
      range: !!object.range
    });

    // ======================
    // CACHE STORE (apenas 200)
    // ======================
    if (!rangeHeader && status === 200) {
      ctx.waitUntil(cache.put(request, response.clone()));
      console.log("[CACHE STORE] Arquivo inteiro");
    }

    return response;
  }
};

// ======================
// UTIL: adiciona CORS a cache hit
// ======================
function addCors(cached, corsHeaders) {
  const headers = new Headers(cached.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }

  return new Response(cached.body, {
    status: cached.status,
    headers
  });
}
