# Application boundaries

## Selected stack

MMM uses TypeScript and ESM in one `@tanaab/mmm` package. Bun owns installation, development checks, tests, and builds. Node 26 is the supported runtime for distributed commands. The application stack selected for follow-on work is Hono with Zod for the server and validated HTTP contracts, Commander with Chalk for the scriptable CLI, and Ink with React for the terminal command center. These packages enter `package.json` when their owning code is added, so this baseline does not ship unused runtime dependencies.

Published npm engine metadata for this stack was checked against Node 26 on 2026-09-29. The owning issues should check versions again when they add dependencies and exercise their built artifacts under Node.

The server will own lifecycle and mutable application state. CLI and TUI will call the same server API rather than keeping separate copies of trading state. HTTP requests will carry commands and queries; server-sent events will carry long-lived status and event updates. The server API and reconnect behavior belong to [#3](https://github.com/tanaabased/mmm/issues/3); CLI behavior belongs to [#4](https://github.com/tanaabased/mmm/issues/4), and TUI behavior to [#5](https://github.com/tanaabased/mmm/issues/5).

## Trading boundaries

Keep market-data adapters, execution adapters, and decision services separate. Provider data should enter through market-data contracts; execution should be a distinct, explicitly controlled boundary; decision services such as Jev should supply decisions rather than own arithmetic, session rules, or execution limits. This document records boundaries only. No provider, decision model, strategy, or live order path is implemented here.

Small repository-owned research notes can live in `research/*.md`; fixtures belong beside the tests that use them. The Python and QuantConnect work on `origin/scaffold1` is historical reference, not a migration source or a second supported runtime.
