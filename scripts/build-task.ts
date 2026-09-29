import { chmod } from 'node:fs/promises';

const entrypoints = ['mmm', 'mmm-server', 'mmm-tui'].map((name) => `bin/${name}.ts`);
const result = await Bun.build({
  entrypoints,
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  naming: '[name].js',
});

if (!result.success) {
  for (const log of result.logs) {
    process.stderr.write(`${log}\n`);
  }
  process.exitCode = 1;
} else {
  for (const output of result.outputs) {
    const source = await output.text();
    const withoutShebang = source.replace(/^#![^\n]*\n/, '');
    await Bun.write(output.path, `#!/usr/bin/env node\n${withoutShebang}`);
    await chmod(output.path, 0o755);
  }
}
