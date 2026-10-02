# MMM

MMM is the TypeScript foundation for an automated trading application. This repository currently provides the package and build scaffold. The server, CLI commands, and terminal command center are tracked separately and do not operate yet.

## Development

Use the versions in `.bun-version` and `.node-version`: Bun runs development tools, and Node 26 runs the packaged commands.

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:package
```

The package exposes one Node 26 command, `mmm`. Bare `mmm` shows help; `mmm --version`, `mmm server --help`, and `mmm tui --help` expose the scaffold. Server and TUI invocations without help still exit with their owning issue link. The package check installs a freshly packed tarball in a temporary consumer and exercises its command.

`bun run test:unit` checks scaffold behavior. `bun run test:research` runs the analytics decision's calculation, correction/replay, configuration, and session proofs under both Bun and Node 26, without accounts or credentials. Both use the root frozen install; lint, formatting, and type checking remain separate root checks.

## Layout and direction

`bin/` owns public command entrypoints, `lib/` owns shared implementation, `scripts/` owns internal tooling, and `test/` holds focused tests and fixtures. Keep tests with the nearest owner if independent scopes are added later. See [ARCHITECTURE.md](ARCHITECTURE.md) for the selected stack and service boundaries.

Research decisions and their proofs live under `docs/decisions/`. The obsolete Python/QuantConnect setup is retired; historical experiments remain in Git history, with no supported Python runtime or migration work.

## Delivery

The package name is `@tanaab/mmm`. The local tarball is installable, but this scaffold has no published npm release. [Issue #6](https://github.com/tanaabased/mmm/issues/6) owns release validation and publication. No live trading or order execution is provided by this baseline.
