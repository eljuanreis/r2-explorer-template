export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");

    // ======================
    // CONFIGURAÇÃO DE CORS
    // ======================
    const ALLOWED_ORIGINS = [
      "https://seusite.com",
      "https://www.seusite.com"
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

    // ======================
    // PREFLIGHT (CORS)
    // ======================
    if (request.method === "OPTIONS") {
      console.log("[CORS] Preflight");
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // ======================
    // MÉTODO PERMITIDO
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

    // Caminho do arquivo no bucket
    const key = url.pathname.replace(/^\/+/, "");

    if (!key) {
      console.log("[ERROR] Arquivo não informado");
      return new Response("Arquivo não informado", {
        status: 400,
        headers: corsHeaders
      });
    }

    // Header Range (se existir)
    const rangeHeader = request.headers.get("Range");

    console.log("[REQUEST]", {
      url: url.toString(),
      key,
      range: rangeHeader || "none"
    });

    // ======================
    // CACHE FIRST (APENAS SEM RANGE)
    // ======================
    if (!rangeHeader) {
      const cached = await cache.match(request);
      if (cached) {
        console.log("[CACHE HIT] Arquivo inteiro");
        return addCorsToCached(cached, corsHeaders);
      }
    }

    console.log("[CACHE MISS] Buscando no bucket");

    // ======================
    // BUSCA NO BUCKET
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
    // HEADERS DA RESPOSTA
    // ======================
    const headers = new Headers();
    object.writeHttpMetadata(headers);

    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream"
    );

    // Cache por 10 minutos
    headers.set("Cache-Control", "public, max-age=600");

    // Headers de Range
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

    // ======================
    // SALVA NO CACHE
    // SOMENTE RESPOSTA 200
    // ======================
    if (!rangeHeader && status === 200) {
      ctx.waitUntil(cache.put(request, response.clone()));
      console.log("[CACHE STORE] Arquivo inteiro");
    }

    return response;
  }
};

// ======================
// UTIL: adiciona CORS a resposta do cache
// ======================
function addCorsToCached(cached, corsHeaders) {
  const headers = new Headers(cached.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }

  return new Response(cached.body, {
    status: cached.status,
    headers
  });
}
