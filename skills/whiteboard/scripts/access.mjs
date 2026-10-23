// Request checks for a session's loopback server. A web page in the user's
// browser can reach loopback ports, so the server must reject other origins,
// rebound hostnames, and callers that lack this session's token.
import { timingSafeEqual } from 'node:crypto';

export const tokenHeader = 'x-whiteboard-token';
export const tokenParam = 'whiteboard_token';
export const cookieName = port => `whiteboard_${port}`;

function same(value, token) {
  if (typeof value !== 'string' || !token) return false;
  const a = Buffer.from(value), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function cookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

// Returns { ok: true }, { status, message }, or { redirect, setCookie }.
export function checkRequest(req, { port, token }) {
  const hosts = ['127.0.0.1', 'localhost', '[::1]'].map(host => `${host}:${port}`);
  const host = String(req.headers.host || '').toLowerCase();
  if (!hosts.includes(host)) return { status: 421, message: 'Unrecognized host.' };
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return { status: 403, message: 'Cross-origin request refused.' };

  const url = new URL(req.url || '/', `http://${host}`);
  const name = cookieName(port);
  if (same(req.headers[tokenHeader], token) || same(cookie(req.headers.cookie, name), token)) return { ok: true };
  if (req.method === 'GET' && same(url.searchParams.get(tokenParam), token)) {
    url.searchParams.delete(tokenParam);
    return {
      redirect: `${url.pathname}${url.search}`,
      setCookie: `${name}=${token}; Path=/; HttpOnly; SameSite=Strict`,
    };
  }
  return { status: 401, message: 'Whiteboard token required. Open the URL returned by session.mjs open.' };
}
