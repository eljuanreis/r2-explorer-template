export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

    // Busca do R2
    const obj = await env.MY_BUCKET.get(objectKey);
    if (!obj) return new Response('Not found', { status: 404 });

    // Retorna direto - Cloudflare cuida do resto!
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'audio/mpeg',
        'Content-Length': obj.size,
        'Accept-Ranges': 'bytes',
        'ETag': obj.httpEtag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      }
    });
  }
};
