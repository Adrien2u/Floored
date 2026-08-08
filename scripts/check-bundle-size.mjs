// Enforces the bundle budget from the plan: JS < 400 KB gzipped, CSS < 50 KB gzipped.
// Fails CI on regression so "low resource" stays a fact rather than an aspiration.
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGETS = { js: 400 * 1024, css: 50 * 1024 };
const DIST = 'dist';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

try {
  await stat(DIST);
} catch {
  console.error(`[size] ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

const files = await walk(DIST);
const totals = { js: 0, css: 0 };

for (const file of files) {
  const ext = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  totals[ext] += gzipSync(await readFile(file)).length;
}

let failed = false;
for (const [ext, budget] of Object.entries(BUDGETS)) {
  const used = totals[ext];
  const pct = ((used / budget) * 100).toFixed(1);
  const line = `[size] ${ext.toUpperCase()}: ${(used / 1024).toFixed(1)} KB gz / ${(budget / 1024).toFixed(0)} KB budget (${pct}%)`;
  if (used > budget) {
    console.error(`${line}  OVER BUDGET`);
    failed = true;
  } else {
    console.log(line);
  }
}

process.exit(failed ? 1 : 0);
