export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 })
    }

    const auth = request.headers.get("Authorization")
    if (auth !== "Bearer segredo123") {
      return new Response("Unauthorized", { status: 401 })
    }

    const url = new URL(request.url)
    const cache = caches.default
    const key = url.pathname.replace(/^\/+/, "")

    if (!key) {
      return new Response("Arquivo não informado", { status: 400 })
    }

    // tenta cache primeiro
    let cached = await cache.match(request)
    if (cached) {
      return cached
    }

    const object = await env.MY_BUCKET.get(key)
    if (!object) {
      return new Response("Not found", { status: 404 })
    }

    const etag = object.httpEtag || object.etag

    // suporte a If-None-Match
    const ifNoneMatch = request.headers.get("If-None-Match")
    if (etag && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Cache-Control": "public, max-age=600"
        }
      })
    }

    const response = new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=600",
        "ETag": etag
      }
    })

    ctx.waitUntil(cache.put(request, response.clone()))
    return response
  }
}
