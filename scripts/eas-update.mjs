#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync, execSync } from 'child_process';

const args = process.argv.slice(2);

// 檢查是否已有 --message 或 -m 參數，或只是查詢 --help
const isHelp = args.some(arg => arg === '--help' || arg === '-h');
const hasMessage = isHelp || args.some((arg) => {
  if (arg === '--message' || arg === '-m') return true;
  if (arg.startsWith('--message=')) return true;
  return false;
});

// 若未指定訊息，動態抓取當前完整版本號與最新 Git Commit 標題作為預設訊息
let defaultMessage = '';
if (!hasMessage) {
  try {
    const rawVersion = fs.readFileSync(path.resolve(process.cwd(), 'src/constants/version.ts'), 'utf-8');
    const revMatch = rawVersion.match(/APP_BUILD_REVISION\s*=\s*(\d+)/);
    const rev = revMatch ? revMatch[1] : '0';
    const appJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'app.json'), 'utf-8'));
    const baseVersion = appJson?.expo?.version || '1.0.13';
    const fullVersion = `${baseVersion}.${rev}`;

    let commitMsg = '';
    try {
      commitMsg = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    } catch {}

    defaultMessage = commitMsg ? `v${fullVersion}: ${commitMsg}` : `v${fullVersion} OTA update`;
  } catch (err) {
    defaultMessage = 'v1.0.15.40 OTA update';
  }
}

const commandArgs = [
  'eas-cli@latest',
  'update',
  '--channel',
  'preview',
  '--environment',
  'preview',
  ...(!hasMessage && defaultMessage ? ['--message', defaultMessage] : []),
  ...args,
];

console.log(`🚀 執行 EAS Update 推播...`);
if (!hasMessage) {
  console.log(`📝 自動帶入更新備註: "${defaultMessage}"`);
}

const result = spawnSync('npx', commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    CI: '1',
    NODE_OPTIONS: process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} --max-old-space-size=4096` : '--max-old-space-size=4096',
  },
});

process.exit(result.status ?? 0);
