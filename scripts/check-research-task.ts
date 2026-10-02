import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = ['node_modules/mocha/bin/mocha.js', 'docs/decisions/analytics/test/*.spec.mts'];

for (const runtime of ['bun', 'node']) {
  const result = spawnSync(runtime, runtime === 'bun' ? ['--bun', ...tests] : tests, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) {
  const provenance = spawnSync(
    'node',
    [
      '-e',
      'console.log(`Node ${process.version}; ICU ${process.versions.icu}; tz ${process.versions.tz}`)',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (provenance.error) throw provenance.error;
  process.exitCode = provenance.status ?? 1;
}
