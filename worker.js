export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

    // Tenta cache primeiro
    const cache = caches.default;
    const cacheKey = new Request(url.toString());
    let cached = await cache.match(cacheKey);

    if (cached) {
      // Clone e adiciona header
      const response = new Response(cached.body, cached);
      response.headers.set('X-Worker-Cache', 'HIT');
      return response;
    }

    // Busca do R2
    const obj = await env.MY_BUCKET.get(objectKey);
    if (!obj) return new Response('Not found', { status: 404 });

    const response = new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'audio/mpeg',
        'Content-Length': obj.size,
        'Accept-Ranges': 'bytes',
        'ETag': obj.httpEtag,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Worker-Cache': 'MISS',
      }
    });

    // Cacheia
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  }
};