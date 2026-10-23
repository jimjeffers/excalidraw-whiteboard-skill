// Request checks for a session's loopback server. A web page in the user's
// browser can reach loopback ports, so the server must reject other origins,
// rebound hostnames, and callers that lack this session's token. The token is
// never stored in a cookie: cookies are shared by every port on a host, so
// any other local server the browser visits would receive it.
import { timingSafeEqual } from 'node:crypto';

export const tokenHeader = 'x-whiteboard-token';
export const tokenParam = 'whiteboard_token';

// The editor shell and its static files hold no board data.
const publicPath = /^\/(?:|index\.html|(?:assets|fonts)\/[\w\-./]+)$/;
export const isPage = path => path === '/' || path === '/index.html';

function same(value, token) {
  if (typeof value !== 'string' || !token) return false;
  const a = Buffer.from(value), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Returns { ok: true, path } or { status, message }.
export function checkRequest(req, { port, token }, { upgrade = false } = {}) {
  const hosts = ['127.0.0.1', 'localhost', '[::1]'].map(host => `${host}:${port}`);
  const host = String(req.headers.host || '').toLowerCase();
  if (!hosts.includes(host)) return { status: 421, message: 'Unrecognized host.' };
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return { status: 403, message: 'Cross-origin request refused.' };

  const raw = String(req.url || '/');
  const path = raw.split('?')[0];
  if (same(req.headers[tokenHeader], token)) return { ok: true, path };
  // Browsers cannot set headers on a WebSocket, so the page sends the token in the upgrade URL.
  if (upgrade && same(new URL(raw, `http://${host}`).searchParams.get(tokenParam), token)) return { ok: true, path };
  if (!upgrade && (req.method === 'GET' || req.method === 'HEAD') && publicPath.test(path) && !path.includes('..')) {
    return { ok: true, path, public: true };
  }
  return { status: 401, message: 'Whiteboard token required. Open the URL returned by session.mjs open.' };
}
