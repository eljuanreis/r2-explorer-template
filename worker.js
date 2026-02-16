export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);
    
    // Request do arquivo completo (ignora range)
    const cacheKey = new Request(url.origin + url.pathname);
    const cache = caches.default;
    
    // Tenta pegar do cache
    let cached = await cache.match(cacheKey);
    let fullBody, size, contentType, etag;
    
    if (!cached) {
      // Busca do R2
      const obj = await env.MY_BUCKET.get(objectKey);
      if (!obj) return new Response('Not found', { status: 404 });
      
      fullBody = await obj.arrayBuffer();
      size = fullBody.byteLength;
      contentType = obj.httpMetadata?.contentType || 'audio/mpeg';
      etag = obj.httpEtag;
      
      // Cacheia
      ctx.waitUntil(cache.put(cacheKey, new Response(fullBody, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'ETag': etag,
        }
      })));
    }
    
    if (cached) {
      fullBody = await cached.arrayBuffer();
      size = fullBody.byteLength;
      contentType = cached.headers.get('Content-Type');
      etag = cached.headers.get('ETag');
    }
    
    // Processa range
    const range = request.headers.get('range');
    if (range) {
      const [start, end] = range.replace('bytes=', '').split('-').map(Number);
      const finalEnd = end || size - 1;
      const chunk = fullBody.slice(start, finalEnd + 1);
      
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${finalEnd}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.byteLength,
          'ETag': etag,
        }
      });
    }
    
    // Arquivo completo
    return new Response(fullBody, {
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': size,
        'ETag': etag,
      }
    });
  }
};
