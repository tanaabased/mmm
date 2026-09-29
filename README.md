# MMM

MMM is the TypeScript foundation for an automated trading application. This repository currently provides the package and build scaffold. The server, CLI commands, and terminal command center are tracked separately and do not operate yet.

## Development

Use the versions in `.bun-version` and `.node-version`: Bun runs development tools, and Node 26 runs the packaged commands.

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:unit
bun run build
```

`dist/mmm.js`, `dist/mmm-server.js`, and `dist/mmm-tui.js` are built for Node 26. Each currently supports `--help` and `--version`; other invocations exit with an issue link because application behavior has not been implemented. To inspect the prospective npm package, build first and run `npm pack --dry-run --ignore-scripts`.

## Layout and direction

`bin/` owns public command entrypoints, `lib/` owns shared implementation, `scripts/` owns internal tooling, and `test/` holds focused tests and fixtures. Keep tests with the nearest owner if independent scopes are added later. See [ARCHITECTURE.md](ARCHITECTURE.md) for the selected stack and service boundaries.

The earlier Python and QuantConnect experiments remain on [`origin/scaffold1`](https://github.com/tanaabased/mmm/tree/scaffold1) as reference. They are not part of this package or its build.

## Delivery

The package name is `@tanaab/mmm`. The local tarball is installable, but this scaffold has no published npm release. [Issue #6](https://github.com/tanaabased/mmm/issues/6) owns release validation and publication. No live trading or order execution is provided by this baseline.
