export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

    const cacheKey = new Request(url.origin + url.pathname);
    const cache = caches.default;

    let cached = await cache.match(cacheKey);
    let fullBody, size, contentType, etag;
    let cacheStatus = 'MISS';

    if (!cached) {
      const obj = await env.MY_BUCKET.get(objectKey);
      if (!obj) return new Response('Not found', { status: 404 });

      fullBody = await obj.arrayBuffer();
      size = fullBody.byteLength;
      contentType = obj.httpMetadata?.contentType || 'audio/mpeg';
      etag = obj.httpEtag;

      ctx.waitUntil(cache.put(cacheKey, new Response(fullBody, {
        headers: {
          'Content-Type': contentType,
          'ETag': etag,
        }
      })));

      console.log('Cache MISS', { cacheKey: cacheKey.url, objectKey, size, contentType });
    } else {
      cacheStatus = 'HIT';
      fullBody = await cached.arrayBuffer();
      size = fullBody.byteLength;
      contentType = cached.headers.get('Content-Type');
      etag = cached.headers.get('ETag');

      console.log('Cache HIT', { cacheKey: cacheKey.url, objectKey, size });
    }

    const range = request.headers.get('range');
    if (range) {
      const [start, end] = range.replace('bytes=', '').split('-').map(Number);
      const finalEnd = end || size - 1;
      const chunk = fullBody.slice(start, finalEnd + 1);

      console.log('Range request', { cacheStatus, range: `${start}-${finalEnd}`, chunkSize: chunk.byteLength, totalSize: size });

      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${finalEnd}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.byteLength,
          'ETag': etag,
          'X-Cache-Status': cacheStatus,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'CDN-Cache-Control': 'public, max-age=31536000',
        }
      });
    }

    console.log('Full file request', { cacheStatus, size });

    return new Response(fullBody, {
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': size,
        'ETag': etag,
        'X-Cache-Status': cacheStatus,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000',
      }
    });
  }
};
