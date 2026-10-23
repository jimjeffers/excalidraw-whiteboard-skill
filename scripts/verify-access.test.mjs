import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRequest, cookieName, tokenHeader, tokenParam } from '../skills/whiteboard/scripts/access.mjs';

const access = { port: '43123', token: 'session-token' };
const request = (headers = {}, url = '/api/elements', method = 'GET') => ({ method, url, headers: { host: '127.0.0.1:43123', ...headers } });

test('accepts the session token as a header or this port\'s cookie', () => {
  assert.deepEqual(checkRequest(request({ [tokenHeader]: 'session-token' }), access), { ok: true });
  assert.deepEqual(checkRequest(request({ cookie: `other=1; ${cookieName(43123)}=session-token` }), access), { ok: true });
  assert.equal(checkRequest(request({ cookie: `${cookieName(43124)}=session-token` }), access).status, 401);
});

test('refuses missing or wrong tokens', () => {
  assert.equal(checkRequest(request(), access).status, 401);
  assert.equal(checkRequest(request({ [tokenHeader]: 'session-tokem' }), access).status, 401);
  assert.equal(checkRequest(request({ [tokenHeader]: 'x' }), access).status, 401);
  assert.equal(checkRequest(request({}, '/'), { ...access, token: '' }).status, 401);
});

test('refuses rebound hostnames and other ports', () => {
  for (const host of ['evil.example:43123', '127.0.0.1:43124', '127.0.0.1', '']) {
    assert.equal(checkRequest(request({ host, [tokenHeader]: 'session-token' }), access).status, 421, host);
  }
  assert.deepEqual(checkRequest(request({ host: 'localhost:43123', [tokenHeader]: 'session-token' }), access), { ok: true });
});

test('refuses cross-origin requests even with a valid cookie', () => {
  const cookie = `${cookieName(43123)}=session-token`;
  for (const origin of ['https://evil.example', 'http://127.0.0.1:43124', 'null', 'http://localhost:43123']) {
    assert.equal(checkRequest(request({ origin, cookie }), access).status, 403, origin);
  }
  assert.deepEqual(checkRequest(request({ origin: 'http://127.0.0.1:43123', cookie }), access), { ok: true });
});

test('exchanges a URL token for a cookie and strips it from the address', () => {
  const result = checkRequest(request({}, `/?${tokenParam}=session-token&view=1`), access);
  assert.equal(result.redirect, '/?view=1');
  assert.match(result.setCookie, /^whiteboard_43123=session-token; Path=\/; HttpOnly; SameSite=Strict$/);
  assert.equal(checkRequest(request({}, `/?${tokenParam}=session-token`, 'POST'), access).status, 401);
  assert.equal(checkRequest(request({}, `/?${tokenParam}=wrong`), access).status, 401);
});
