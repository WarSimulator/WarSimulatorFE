// Test-only, fixed-upstream Range relay. Never fetch the entire planet archive.
export function mapBenchmarkProxy() {
  const register = server => { server.middlewares.use(async (request, response, next) => {
    if (request.url?.split('?')[0] !== '/simulator/map-benchmark/remote-base.pmtiles') return next();
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '');
    if (request.method !== 'GET' || !match || Number(match[2]) < Number(match[1]) || Number(match[2]) - Number(match[1]) > 8 * 1024 * 1024) {
      response.statusCode = 400; response.end('A bounded GET Range request is required.'); return;
    }
    try {
      const upstream = await fetch('https://build.protomaps.com/20261012.pmtiles', { headers: { Range: request.headers.range }, signal: AbortSignal.timeout(20000) });
      if (upstream.status !== 206) { response.statusCode = 502; response.end(`Upstream returned ${upstream.status}, expected 206.`); return; }
      response.statusCode = 206;
      for (const name of ['content-type', 'content-range', 'content-length', 'etag', 'accept-ranges']) {
        const value = upstream.headers.get(name); if (value) response.setHeader(name, value);
      }
      response.setHeader('cache-control', 'no-store');
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) { response.statusCode = 502; response.end(error instanceof Error ? error.message : 'Upstream unavailable'); }
  }); };
  return { name: 'map-benchmark-range-relay', configureServer: register, configurePreviewServer: register };
}
