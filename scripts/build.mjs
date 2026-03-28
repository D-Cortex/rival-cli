#!/usr/bin/env node
import { build } from 'esbuild';
import { execSync } from 'child_process';

const target = process.argv[2]; // e.g. macos-arm64

const PKG_TARGETS = {
  'macos-arm64': 'node18-macos-arm64',
  'macos-x64':   'node18-macos-x64',
  'linux-x64':   'node18-linux-x64',
  'win-x64':     'node18-win-x64',
};

const OUTPUT = {
  'macos-arm64': 'rival-macos-arm64',
  'macos-x64':   'rival-macos-x64',
  'linux-x64':   'rival-linux-x64',
  'win-x64':     'rival-win-x64.exe',
};

if (target && !PKG_TARGETS[target]) {
  console.error(`Unknown target: ${target}`);
  console.error(`Valid targets: ${Object.keys(PKG_TARGETS).join(', ')}`);
  process.exit(1);
}

// ── Step 1: esbuild — bundle TS + all node_modules → single CJS file ────────
console.log('Bundling with esbuild…');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'bundle.cjs',
  minify: false,
});
console.log('  → bundle.cjs');

// ── Step 2: pkg — wrap bundle.cjs into native binary ────────────────────────
const targets = target ? [target] : Object.keys(PKG_TARGETS);

for (const t of targets) {
  const pkgTarget = PKG_TARGETS[t];
  const output = OUTPUT[t];
  console.log(`\nPackaging for ${t}…`);
  execSync(
    `npx @yao-pkg/pkg bundle.cjs --target ${pkgTarget} --output ${output} --compress GZip`,
    { stdio: 'inherit' }
  );
  console.log(`  → ${output}`);
}

console.log('\nDone!');
