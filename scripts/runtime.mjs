import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const upstream = join(root, 'upstream/mcp_excalidraw');
export const revision = '8084a1c8b410d625fcfd59d5cffb32f3a86a2a6f';
export const port = '3210';
export const url = `http://127.0.0.1:${port}`;
export function environment() {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new Error('Node 20 or newer is required; this project uses Node 24.14.0.');
  }
  mkdirSync(join(root, '.local/state'), { recursive: true, mode: 0o700 });
  return {
    ...process.env,
    PATH: `${dirname(process.execPath)}:${process.env.PATH || ''}`,
    HOST: '127.0.0.1', PORT: port, EXPRESS_SERVER_URL: url,
    EXCALIDRAW_DATA_DIR: join(root, '.local/state'),
    EXCALIDRAW_EXPORT_DIR: root,
    LOG_FILE_PATH: join(root, '.local/canvas.log'),
    LOG_LEVEL: 'warn', ENABLE_CANVAS_SYNC: 'true',
  };
}
