import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRequest, tokenHeader, tokenParam } from '../skills/whiteboard/scripts/access.mjs';

const access = { port: '43123', token: 'session-token' };
const request = (headers = {}, url = '/api/elements', method = 'GET') => ({ method, url, headers: { host: '127.0.0.1:43123', ...headers } });
const upgrade = { upgrade: true };

test('accepts the session token header', () => {
  assert.equal(checkRequest(request({ [tokenHeader]: 'session-token' }), access).ok, true);
  assert.equal(checkRequest(request({ [tokenHeader]: 'session-token' }, '/api/elements/clear', 'DELETE'), access).ok, true);
});

test('refuses missing or wrong tokens, including cookies', () => {
  assert.equal(checkRequest(request(), access).status, 401);
  assert.equal(checkRequest(request({ [tokenHeader]: 'session-tokem' }), access).status, 401);
  assert.equal(checkRequest(request({ [tokenHeader]: 'x' }), access).status, 401);
  assert.equal(checkRequest(request({ cookie: 'whiteboard_43123=session-token' }), access).status, 401);
  assert.equal(checkRequest(request({ [tokenHeader]: '' }), { ...access, token: '' }).status, 401);
  for (const path of ['/health', '/__whiteboard/session', '/api/snapshots', '/API/elements', '/assets/../api/elements']) {
    assert.equal(checkRequest(request({}, path), access).status, 401, path);
  }
});

test('serves only the editor shell and static files without a token', () => {
  for (const path of ['/', '/index.html', '/assets/index-CXPz8WjL.js', '/fonts/Excalifont/a.woff2']) {
    assert.equal(checkRequest(request({}, path), access).public, true, path);
  }
  assert.equal(checkRequest(request({}, '/', 'HEAD'), access).public, true);
  assert.equal(checkRequest(request({}, '/assets/x.js', 'POST'), access).status, 401);
  assert.equal(checkRequest(request({}, `/api/elements?${tokenParam}=session-token`), access).status, 401);
});

test('accepts a URL token only on WebSocket upgrades', () => {
  assert.equal(checkRequest(request({}, `/?${tokenParam}=session-token`), access, upgrade).ok, true);
  assert.equal(checkRequest(request({}, `/?${tokenParam}=wrong`), access, upgrade).status, 401);
  assert.equal(checkRequest(request({}, '/'), access, upgrade).status, 401);
  assert.equal(checkRequest(request({ origin: 'https://evil.example' }, `/?${tokenParam}=session-token`), access, upgrade).status, 403);
});

test('refuses rebound hostnames and other ports', () => {
  for (const host of ['evil.example:43123', '127.0.0.1:43124', '127.0.0.1', '']) {
    assert.equal(checkRequest(request({ host, [tokenHeader]: 'session-token' }), access).status, 421, host);
    assert.equal(checkRequest(request({ host }, '/'), access).status, 421, host);
  }
  assert.equal(checkRequest(request({ host: 'localhost:43123', [tokenHeader]: 'session-token' }), access).ok, true);
});

test('refuses cross-origin requests even with a valid token', () => {
  for (const origin of ['https://evil.example', 'http://127.0.0.1:43124', 'null', 'http://localhost:43123']) {
    assert.equal(checkRequest(request({ origin, [tokenHeader]: 'session-token' }), access).status, 403, origin);
  }
  assert.equal(checkRequest(request({ origin: 'http://127.0.0.1:43123', [tokenHeader]: 'session-token' }), access).ok, true);
});
