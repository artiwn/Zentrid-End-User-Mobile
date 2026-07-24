const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5050);
const AUTH_TARGET = process.env.ZENTRID_AUTH_TARGET || 'https://fleetosauth.unisys.am';
const DATA_TARGET = process.env.ZENTRID_DATA_TARGET || 'https://fleetosapi.unisys.am';
const STATIC_ROOT = __dirname;

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src-elem 'self'",
  "script-src-attr 'unsafe-inline'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' http://localhost:5050 https://fleetosauth.unisys.am https://fleetosapi.unisys.am",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'"
].join('; ');

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function setSecurityHeaders(response: any): void {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Content-Security-Policy-Report-Only', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
}

function sendJson(response: any, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function readBody(request: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) reject(new Error('Request body exceeds 10 MB.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function proxyRequest(target: string, request: any, response: any): Promise<void> {
  try {
    const method = String(request.method || 'GET').toUpperCase();
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await readBody(request);
    const upstream = await fetch(`${target}${request.url || '/'}`, {
      method,
      headers: {
        'Content-Type': String(request.headers['content-type'] || 'application/json'),
        Accept: String(request.headers.accept || 'application/json'),
        ...(request.headers.authorization ? { Authorization: String(request.headers.authorization) } : {})
      },
      ...(body !== undefined ? { body } : {})
    });
    const payload = await upstream.arrayBuffer();
    response.statusCode = upstream.status;
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.end(new Uint8Array(payload));
  } catch (error) {
    sendJson(response, 500, {
      message: 'Proxy error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function safeStaticPath(pathname: string): string | null {
  const requested = pathname === '/' ? '/index.html' : pathname;
  let decoded = '';
  try {
    decoded = decodeURIComponent(requested);
  } catch (_error) {
    return null;
  }
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const absolute = path.resolve(STATIC_ROOT, `.${normalized.startsWith('/') ? normalized : `/${normalized}`}`);
  const root = path.resolve(STATIC_ROOT);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

function serveStatic(pathname: string, response: any): void {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    sendJson(response, 400, { message: 'Invalid path.' });
    return;
  }
  fs.stat(filePath, (error: unknown, stats: any) => {
    if (error || !stats?.isFile()) {
      sendJson(response, 404, { message: 'Not found.' });
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.statusCode = 200;
    response.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
    if (pathname === '/sw.js') response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request: any, response: any) => {
  setSecurityHeaders(response);
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `localhost:${PORT}`}`);
  const pathname = requestUrl.pathname;

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (pathname === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'Zentrid End User Mobile local proxy', port: PORT });
    return;
  }
  if (pathname.startsWith('/api/Auth') || pathname.startsWith('/.well-known')) {
    await proxyRequest(AUTH_TARGET, request, response);
    return;
  }
  if (pathname.startsWith('/api/')) {
    await proxyRequest(DATA_TARGET, request, response);
    return;
  }
  serveStatic(pathname, response);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zentrid End User Mobile running on http://localhost:${PORT}`);
  console.log(`Auth API -> ${AUTH_TARGET}`);
  console.log(`Data API -> ${DATA_TARGET}`);
});
