export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    /* ===============================
       CONFIGURAÇÕES
    =============================== */

    const ALLOWED_ORIGINS = [
      "https://seusite.com",
      "http://localhost:3000"
    ]

    const CACHE_TTL = 600 // 10 minutos
    const cache = caches.default

    /* ===============================
       CORS
    =============================== */

    const origin = request.headers.get("Origin")
    const corsHeaders = {}

    if (ALLOWED_ORIGINS.includes(origin)) {
      corsHeaders["Access-Control-Allow-Origin"] = origin
      corsHeaders["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
      corsHeaders["Access-Control-Allow-Headers"] = "Range"
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      })
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 })
    }

    /* ===============================
       CACHE (SÓ PARA REQUEST SEM RANGE)
    =============================== */

    const hasRange = request.headers.has("Range")

    if (!hasRange) {
      const cached = await cache.match(request)
      if (cached) {
        console.log("CACHE HIT:", url.pathname)
        return cached
      }
    }

    console.log("CACHE MISS:", url.pathname)

    /* ===============================
       KEY DO R2 (SEM / INICIAL)
    =============================== */

    const key = url.pathname.replace(/^\/+/, "")
    console.log("R2 KEY:", key)

    /* ===============================
       BUSCA NO R2
    =============================== */

    let object

    try {
      object = await env.MY_BUCKET.get(key, {
        range: hasRange ? request.headers.get("Range") : undefined
      })
    } catch (err) {
      console.error("R2 ERROR:", err)
      return new Response("Internal error accessing storage", { status: 500 })
    }

    if (!object) {
      console.log("R2 404:", key)
      return new Response("Not found", { status: 404 })
    }

    /* ===============================
       HEADERS DE RESPOSTA
    =============================== */

    const headers = new Headers()
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream")
    headers.set("Accept-Ranges", "bytes")

    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v)
    }

    if (object.range) {
      headers.set(
        "Content-Range",
        `bytes ${object.range.offset}-${object.range.end}/${object.size}`
      )
      headers.set("Content-Length", object.range.length)
    } else {
      headers.set("Content-Length", object.size)
    }

    const status = hasRange ? 206 : 200

    const response = new Response(
      request.method === "HEAD" ? null : object.body,
      { status, headers }
    )

    /* ===============================
       CACHE PUT (APENAS 200)
    =============================== */

    if (!hasRange && status === 200) {
      headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`)
      ctx.waitUntil(cache.put(request, response.clone()))
      console.log("CACHE STORE:", url.pathname)
    }

    return response
  }
}
