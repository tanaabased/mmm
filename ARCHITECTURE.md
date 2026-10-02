# Application boundaries

## Selected stack

MMM uses TypeScript and ESM in one `@tanaab/mmm` package. Bun owns installation, development checks, tests, and builds. Node 26 is the supported runtime for distributed commands. The application stack selected for follow-on work is Hono with Zod for the server and validated HTTP contracts, Commander with Chalk for the scriptable CLI, and Ink with React for the terminal command center. These packages enter `package.json` when their owning code is added, so this baseline does not ship unused runtime dependencies.

Published npm engine metadata for this stack was checked against Node 26 on 2026-09-29. The owning issues should check versions again when they add dependencies and exercise their built artifacts under Node.

The server will own lifecycle and mutable application state. CLI and TUI will call the same server API rather than keeping separate copies of trading state. HTTP requests will carry commands and queries; server-sent events will carry long-lived status and event updates. The server API and reconnect behavior belong to [#3](https://github.com/tanaabased/mmm/issues/3); CLI behavior belongs to [#4](https://github.com/tanaabased/mmm/issues/4), and TUI behavior to [#5](https://github.com/tanaabased/mmm/issues/5).

One public `mmm` command will route explicit `server` and `tui` subcommands to separate implementation modules. Bare invocation shows help. Later CLI operations use the shared API; they do not start a server implicitly. Load server/TUI dependencies only when their subcommand needs them. No shared configuration framework is introduced by this baseline; #3 owns validated configuration and precedence.

## Trading boundaries

Keep market-data adapters, execution adapters, and decision services separate. Provider data should enter through market-data contracts; execution should be a distinct, explicitly controlled boundary; decision services such as Jev should supply decisions rather than own arithmetic, session rules, or execution limits. This document records boundaries only. No provider, decision model, strategy, or live order path is implemented here.

Provider, execution, recovery, and optional Jev work follows [the provider decision](https://github.com/tanaabased/mmm/blob/main/docs/decisions/providers-and-jev.md): Alpaca equities first, initially paper execution, with futures deferred. Calculation, correction/replay, session, and strategy-configuration work follows [the analytics decision](https://github.com/tanaabased/mmm/blob/main/docs/decisions/analytics-and-strategies.md). Keep those contracts in their decision files rather than copying them here.

Research notes and proofs live under `docs/decisions/`, with tests beside their owning modules. Root tooling validates them; evaluated candidate packages are development dependencies until application code actually consumes them. They are excluded from the consumer package. The Python/QuantConnect setup is retired and must not be restored as a second runtime or migration source.
