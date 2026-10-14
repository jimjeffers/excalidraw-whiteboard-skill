import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(project, 'skills', 'whiteboard');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--claude')) {
  throw new Error('Usage: node scripts/install-skill.mjs [--claude]');
}
const profileDir = args[0] === '--claude'
  ? join(homedir(), '.claude')
  : resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
const skillsDir = join(profileDir, 'skills');
const target = join(skillsDir, 'whiteboard');
const backupsDir = join(profileDir, 'skill-backups');

// Stage the whole directory so removed source files also disappear on update.
mkdirSync(skillsDir, { recursive: true });
const staging = mkdtempSync(join(profileDir, '.whiteboard-install-'));
const stagedSkill = join(staging, 'whiteboard');
let backup;
try {
  cpSync(source, stagedSkill, { recursive: true, errorOnExist: true, force: false });
  if (existsSync(target)) {
    mkdirSync(backupsDir, { recursive: true });
    const backupDir = mkdtempSync(join(backupsDir, 'whiteboard-'));
    backup = join(backupDir, 'whiteboard');
    renameSync(target, backup);
  }
  try {
    renameSync(stagedSkill, target);
  } catch (error) {
    if (backup) renameSync(backup, target);
    throw error;
  }
  console.log(`Installed: ${target}`);
  if (backup) console.log(`Previous version: ${backup}`);
  console.log(`Editable source: ${source}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
