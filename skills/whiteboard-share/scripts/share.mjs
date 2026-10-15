#!/usr/bin/env node
import { createHash, webcrypto } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const destination = 'https://json.excalidraw.com/api/v2/post/';
const maxBytes = 5 * 1024 * 1024;
const usage = `Share a saved Excalidraw snapshot (Node 20+)
  inspect FILE.excalidraw
  upload FILE.excalidraw --sha256 HASH --receipt /path/to/share.json
inspect is offline. Only upload sends data to Excalidraw.com.
The receipt stores the private share link; reuse it to avoid duplicate uploads.`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function load(file) {
  const bytes = await readFile(file);
  if (bytes.length > maxBytes) throw new Error('Scene exceeds the 5 MiB input limit.');
  const input = JSON.parse(bytes);
  if (input?.type !== 'excalidraw' || input.version !== 2 || !Array.isArray(input.elements)) {
    throw new Error('Expected a version 2 .excalidraw scene with an elements array.');
  }
  const elements = input.elements.filter(element => !element?.isDeleted);
  if (!elements.length) throw new Error('Scene is empty.');
  const ids = new Set();
  for (const element of elements) {
    const geometry = ['arrow', 'line', 'freedraw'].includes(element?.type) ? ['x', 'y'] : ['x', 'y', 'width', 'height'];
    if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id)
      || typeof element.type !== 'string'
      || !geometry.every(key => Number.isFinite(element[key]))) {
      throw new Error('Scene has invalid elements or duplicate IDs. Export it again from Excalidraw.');
    }
    ids.add(element.id);
    if (element.type === 'image' || element.fileId) {
      throw new Error('Image elements require separate asset uploads. Use Excalidraw.com’s file import and Share workflow for this board; images will not be silently dropped.');
    }
  }
  const scene = {
    type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements,
    appState: {
      viewBackgroundColor: input.appState?.viewBackgroundColor ?? '#ffffff',
      gridSize: input.appState?.gridSize ?? null,
      ...(input.appState?.gridStep != null ? { gridStep: input.appState.gridStep } : {}),
    },
    files: {},
  };
  return {
    scene,
    info: { file: resolve(file), sha256: digest(bytes), elementCount: elements.length, destination, uploaded: false },
  };
}

export async function inspectFile(file) { return (await load(file)).info; }

// Excalidraw's v2 envelope: big-endian length-prefixed chunks, zlib, AES-GCM.
// Protocol: github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/encode.ts
function pack(parts) {
  const output = Buffer.alloc(4 + parts.reduce((sum, part) => sum + 4 + part.length, 0));
  output.writeUInt32BE(1);
  let offset = 4;
  for (const part of parts) {
    output.writeUInt32BE(part.length, offset);
    output.set(part, offset + 4);
    offset += part.length + 4;
  }
  return output;
}
async function encode(scene) {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const compressed = deflateSync(pack([Buffer.from('{}'), Buffer.from(JSON.stringify(scene))]));
  const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed));
  const metadata = Buffer.from(JSON.stringify({ version: 2, compression: 'pako@1', encryption: 'AES-GCM' }));
  const payload = pack([metadata, iv, encrypted]);
  return { payload, key: (await webcrypto.subtle.exportKey('jwk', key)).k };
}

async function save(receipt, record, exclusive = false) {
  await writeFile(receipt, `${JSON.stringify(record, null, 2)}\n`, { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
}
async function verify(record, receipt, transport) {
  try {
    const response = await transport(`https://json.excalidraw.com/api/v2/${record.id}`, {
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Download returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== record.payloadSha256) throw new Error('Downloaded snapshot differs from the uploaded payload');
    record.status = 'verified';
    delete record.verificationError;
  } catch (error) {
    record.verificationError = error.message;
  }
  try { await save(receipt, record); }
  catch (error) { record.receiptError = error.message; }
  return record;
}

export async function uploadFile(file, { sha256, receipt } = {}, transport = fetch) {
  if (!/^[0-9a-f]{64}$/.test(sha256 || '')) throw new Error('Supply the sha256 returned by inspect.');
  if (!receipt) throw new Error('Supply a receipt path to retain the link and prevent duplicate uploads.');
  const { info, scene } = await load(file);
  if (info.sha256 !== sha256) throw new Error('File changed since inspection. Inspect the intended revision again.');
  let existing;
  try { existing = JSON.parse(await readFile(receipt, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (existing.sha256 !== sha256 || existing.destination !== destination) throw new Error('Receipt belongs to another snapshot. Use a new receipt for a new revision.');
    if (existing.status === 'verified') return existing;
    if (existing.status === 'uploaded') return verify(existing, receipt, transport);
    throw new Error('Receipt records a pending or uncertain upload. Inspect it before deliberately creating another snapshot.');
  }
  const { payload, key } = await encode(scene);
  const record = { ...info, status: 'pending', createdAt: new Date().toISOString(), payloadSha256: digest(payload) };
  // Reserve this receipt before any network access, including across concurrent CLI invocations.
  await save(receipt, record, true);
  try {
    const response = await transport(destination, {
      method: 'POST', body: payload, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Upload returned HTTP ${response.status}`);
    const { id } = await response.json();
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Service returned an invalid snapshot ID');
    Object.assign(record, { id, url: `https://excalidraw.com/#json=${id},${key}`, status: 'uploaded', uploaded: true });
  } catch (error) {
    record.status = 'uncertain';
    record.error = error.message;
    await save(receipt, record);
    throw new Error(`Upload outcome is uncertain; no automatic retry. Inspect receipt ${resolve(receipt)} (${error.message}).`);
  }
  // Persist the URL before verification so a failed GET never loses a successful upload.
  try { await save(receipt, record); }
  catch (error) { return { ...record, receiptError: error.message }; }
  return verify(record, receipt, transport);
}

async function main(args) {
  const [command, file, ...options] = args;
  if (!command || command === 'help' || command === '--help') { console.log(usage); return; }
  if (!file || !['inspect', 'upload'].includes(command)) throw new Error(usage);
  if (command === 'inspect') {
    if (options.length) throw new Error(usage);
    console.log(JSON.stringify(await inspectFile(file), null, 2));
    return;
  }
  const values = {};
  while (options.length) {
    const option = options.shift();
    if (!['--sha256', '--receipt'].includes(option) || !options.length || values[option.slice(2)]) throw new Error(usage);
    values[option.slice(2)] = options.shift();
  }
  console.log(JSON.stringify(await uploadFile(file, values), null, 2));
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
