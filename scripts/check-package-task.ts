import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import metadata from '../package.json';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'mmm-package-'));
const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1', npm_config_cache: join(scratch, 'npm-cache') },
  });
  assert.ifError(result.error);
  return result;
};

try {
  const packed = run(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch],
    root,
  );
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  const [tarball] = JSON.parse(packed.stdout) as {
    filename: string;
    files: { path: string }[];
  }[];
  assert.ok(tarball);
  assert.ok(tarball.files.some(({ path }) => path === 'dist/mmm.js'));
  assert.ok(
    tarball.files.every(({ path }) =>
      /^(dist\/mmm\.js|package\.json|README\.md|ARCHITECTURE\.md|LICENSE)$/.test(path),
    ),
  );
  const consumer = join(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  const installed = run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      join(scratch, tarball.filename),
    ],
    consumer,
  );
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const packageRoot = join(consumer, 'node_modules/@tanaab/mmm');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.bin, { mmm: './dist/mmm.js' });
  assert.match(readFileSync(join(packageRoot, 'dist/mmm.js'), 'utf8'), /^#!\/usr\/bin\/env node\n/);
  const node = run('node', ['--version'], consumer);
  assert.equal(node.status, 0, node.stderr);
  assert.match(node.stdout, /^v26\./);
  const executable = join(consumer, 'node_modules/.bin/mmm');
  for (const args of [[], ['--help'], ['server', '--help'], ['tui', '--help']]) {
    const result = run(executable, args, consumer);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: mmm/);
    assert.match(result.stdout, /scaffold/);
    assert.equal(result.stderr, '');
  }
  const version = run(executable, ['--version'], consumer);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), metadata.version);
  for (const [args, issue] of [
    [['server'], 3],
    [['tui'], 5],
    [['unknown'], 4],
  ] as const) {
    const result = run(executable, [...args], consumer);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`issues/${issue}`));
  }
  process.stdout.write('Installed package and mmm command passed under Node 26\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
