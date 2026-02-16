export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

    // Cria cache key sem range (CDN cacheia arquivo completo)
    const cacheUrl = new URL(request.url);
    cacheUrl.search = ''; // Remove query strings
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
      headers: new Headers() // Sem range header
    });

    const cache = caches.default;

    // Tenta pegar arquivo completo do cache da CDN
    let cachedResponse = await cache.match(cacheKey);
    let fullBody, size, contentType, etag;
    let cacheStatus = 'MISS';

    if (cachedResponse) {
      cacheStatus = 'HIT';
      fullBody = await cachedResponse.arrayBuffer();
      size = fullBody.byteLength;
      contentType = cachedResponse.headers.get('Content-Type');
      etag = cachedResponse.headers.get('ETag');

      console.log('CDN Cache HIT', { objectKey, size });
    } else {
      // Busca do R2
      const obj = await env.MY_BUCKET.get(objectKey);
      if (!obj) return new Response('Not found', { status: 404 });

      fullBody = await obj.arrayBuffer();
      size = fullBody.byteLength;
      contentType = obj.httpMetadata?.contentType || 'audio/mpeg';
      etag = obj.httpEtag;

      console.log('CDN Cache MISS', { objectKey, size });

      // Cacheia arquivo completo na CDN
      const responseToCache = new Response(fullBody, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': size,
          'ETag': etag,
          'Cache-Control': 'public, max-age=31536000, immutable',
        }
      });

      ctx.waitUntil(cache.put(cacheKey, responseToCache));
    }

    // Processa range do arquivo já em memória
    const range = request.headers.get('range');
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new Response('Invalid range', { status: 416 });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      const chunk = fullBody.slice(start, end + 1);

      console.log('Range from cache', { cacheStatus, range: `${start}-${end}`, size: chunk.byteLength });

      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.byteLength,
          'ETag': etag,
          'X-Cache-Status': cacheStatus,
          'Cache-Control': 'public, max-age=31536000, immutable',
        }
      });
    }

    // Request completo
    console.log('Full file', { cacheStatus, size });

    return new Response(fullBody, {
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': size,
        'ETag': etag,
        'X-Cache-Status': cacheStatus,
        'Cache-Control': 'public, max-age=31536000, immutable',
      }
    });
  }
};
