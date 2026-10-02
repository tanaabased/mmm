import assert from 'node:assert/strict';

import { scaffoldResult } from '../lib/scaffold.ts';

describe('lib/scaffold', () => {
  it('should expose the package version without claiming runtime readiness', () => {
    assert.deepEqual(scaffoldResult('0.0.0', ['--version']), {
      message: '0.0.0',
      exitCode: 0,
      stream: 'stdout',
    });
  });

  it('should identify the owning issue in help output', () => {
    const result = scaffoldResult('0.0.0', ['server', '--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.message, /issues\/3/);
  });

  it('should reject commands that have not been implemented', () => {
    const result = scaffoldResult('0.0.0', ['tui']);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stream, 'stderr');
    assert.match(result.message, /not implemented yet/);
  });

  it('should show available subcommands for a bare invocation', () => {
    const result = scaffoldResult('0.0.0', []);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stream, 'stdout');
    assert.match(result.message, /Usage: mmm/);
    assert.match(result.message, /server/);
    assert.match(result.message, /tui/);
  });

  it('should reject unknown commands and extra arguments', () => {
    for (const args of [['unknown'], ['server', '--help', 'extra'], ['tui', '--unknown']]) {
      const result = scaffoldResult('0.0.0', args);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stream, 'stderr');
    }
  });
});
