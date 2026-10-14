import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, upstream, environment } from './runtime.mjs';

const args = process.argv.slice(2);
if (args[0] === '--mcp') args.shift();
else if (!args.length) args.push('--help');
const entry = join(upstream, 'dist/bin.js');
if (!existsSync(entry)) throw new Error('Run npm run bootstrap first.');
const child = spawn(process.execPath, [entry, ...args], {
  cwd: root, env: environment(), stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
