export default {
  async fetch(request, env, ctx) {
    // Só permite GET
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

    // Normaliza a chave do cache (ignora headers como Authorization)
    const cacheKey = new Request(url.pathname, { method: 'GET' });

    // Tenta cache primeiro
    let cached = await cache.match(cacheKey);
    if (cached) {
      console.log("Achou no cache!");
      return cached;
    } else {
      console.log("Sem bater no cache!");
    }

    // Pega o arquivo do bucket
    const object = await env.MY_BUCKET.get(key);
    if (!object) {
      console.log("Arquivo não encontrado no bucket:", key);
      return new Response("Not found", { status: 404 });
    }

    const etag = object.httpEtag || object.etag;

    // Suporte a If-None-Match (cache do navegador)
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

    // Cria a resposta com cabeçalhos
    const response = new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=600",
        "ETag": etag
      }
    });

    // Salva no cache do Workers
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    console.log("Arquivo retornado:", key);
    return response;
  }
};
