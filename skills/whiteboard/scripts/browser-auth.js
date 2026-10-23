// Inlined into the editor page by serve.mjs. Moves the token from the URL
// fragment (never sent to a server) into this origin's sessionStorage, then
// adds it to the page's same-origin requests and WebSocket.
(() => {
  const key = 'whiteboard_token';
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has(key)) {
    sessionStorage.setItem(key, fragment.get(key));
    fragment.delete(key);
    const rest = fragment.toString();
    history.replaceState(history.state, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`);
  }
  // Pasting the access URL into an open tab changes only the fragment; reload to pick it up.
  addEventListener('hashchange', () => {
    if (new URLSearchParams(location.hash.slice(1)).has(key)) location.reload();
  });
  const token = sessionStorage.getItem(key);
  if (!token) {
    addEventListener('DOMContentLoaded', () => {
      const notice = document.createElement('p');
      notice.textContent = 'This board needs its access link. Ask the agent to run session.mjs open and use the URL it returns.';
      notice.style.cssText = 'position:fixed;inset:auto 0 0;margin:0;padding:12px 20px;background:#fff3cd;color:#614a14;z-index:10000;font:14px system-ui';
      document.body.append(notice);
    });
    return;
  }
  const fetch = window.fetch;
  window.fetch = (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    if (new URL(request ? request.url : String(input), location.href).origin !== location.origin) return fetch(input, init);
    const headers = new Headers(init.headers || request?.headers);
    headers.set('x-whiteboard-token', token);
    return fetch(input, { ...init, headers });
  };
  const Socket = window.WebSocket;
  window.WebSocket = class extends Socket {
    constructor(url, protocols) {
      const target = new URL(url, location.href);
      if (target.host === location.host) target.searchParams.set(key, token);
      super(target.href, protocols);
    }
  };
})();
