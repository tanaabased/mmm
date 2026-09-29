export type ScaffoldResult = {
  message: string;
  exitCode: number;
  stream: 'stdout' | 'stderr';
};

export function scaffoldResult(
  command: string,
  issue: number,
  version: string,
  args: readonly string[],
): ScaffoldResult {
  if (args.length === 1 && ['-v', '--version'].includes(args[0] ?? '')) {
    return { message: version, exitCode: 0, stream: 'stdout' };
  }

  if (args.length === 1 && ['-h', '--help'].includes(args[0] ?? '')) {
    return {
      message: `${command} is a scaffold. Runtime behavior is tracked in https://github.com/tanaabased/mmm/issues/${issue}.`,
      exitCode: 0,
      stream: 'stdout',
    };
  }

  return {
    message: `${command} is not implemented yet; see https://github.com/tanaabased/mmm/issues/${issue}.`,
    exitCode: 1,
    stream: 'stderr',
  };
}

export function printScaffoldResult(result: ScaffoldResult): void {
  const output = result.stream === 'stdout' ? process.stdout : process.stderr;
  output.write(`${result.message}\n`);
  process.exitCode = result.exitCode;
}
