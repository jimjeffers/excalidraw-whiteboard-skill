// Preloaded into the upstream canvas CLI so its requests to this session's
// server carry the session token. Other destinations are left untouched.
import { tokenHeader } from './access.mjs';

const origin = new URL(process.env.EXPRESS_SERVER_URL).origin;
const token = process.env.WHITEBOARD_TOKEN;
const fetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const request = new Request(input, init);
  if (!token || new URL(request.url).origin !== origin) return fetch(input, init);
  const headers = new Headers(request.headers);
  headers.set(tokenHeader, token);
  return fetch(new Request(request, { headers }));
};
