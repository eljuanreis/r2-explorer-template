export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    console.log("Request method:", request.method);
    console.log("Request URL:", request.url);

    const url = new URL(request.url);
    const cache = caches.default;
    const key = url.pathname.replace(/^\/+/, ""); // caminho dentro do bucket

    if (!key) {
      return new Response("Arquivo não informado", { status: 400 });
    }

    // Cria uma URL completa para o cacheKey
    const cacheKey = new Request(new URL(url.pathname, request.url).toString(), {
      method: 'GET'
    });

    // Tenta cache primeiro
    let cached = await cache.match(cacheKey);
    if (cached) {
      console.log("Achou no cache!");
      return cached;
    } else {
      console.log("Sem bater no cache!");
    }

    const object = await env.MY_BUCKET.get(key);
    if (!object) {
      console.log("Arquivo não encontrado no bucket:", key);
      return new Response("Not found", { status: 404 });
    }

    const etag = object.httpEtag || object.etag;
    const ifNoneMatch = request.headers.get("If-None-Match");

    if (etag && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Cache-Control": "public, max-age=600"
        }
      });
    }

    const response = new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=600",
        "ETag": etag
      }
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    console.log("Arquivo retornado:", key);

    return response;
  }
};
