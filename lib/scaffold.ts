export type ScaffoldResult = {
  message: string;
  exitCode: number;
  stream: 'stdout' | 'stderr';
};

export function scaffoldResult(version: string, args: readonly string[]): ScaffoldResult {
  const subcommand = args[0];
  const issue = subcommand === 'server' ? 3 : subcommand === 'tui' ? 5 : 4;
  const knownSubcommand = subcommand === 'server' || subcommand === 'tui';
  const command = knownSubcommand ? `mmm ${subcommand}` : 'mmm';
  const options = knownSubcommand ? args.slice(1) : args;

  if (options.length === 1 && ['-v', '--version'].includes(options[0] ?? '')) {
    return { message: version, exitCode: 0, stream: 'stdout' };
  }

  if (
    (!knownSubcommand && args.length === 0) ||
    (options.length === 1 && ['-h', '--help'].includes(options[0] ?? ''))
  ) {
    return {
      message: [
        `Usage: ${command}${knownSubcommand ? '' : ' [command]'} [options]`,
        '',
        'Options:',
        '  -h, --help     Show help',
        '  -v, --version  Show the package version',
        ...(knownSubcommand
          ? []
          : [
              '',
              'Commands:',
              '  server        Server scaffold',
              '  tui           Terminal client scaffold',
            ]),
        '',
        `${command} is a scaffold. Runtime behavior is tracked in https://github.com/tanaabased/mmm/issues/${issue}.`,
      ].join('\n'),
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
