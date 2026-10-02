# Repository guidance

- Keep MMM as one TypeScript/ESM package. Bun runs development tools; built consumer commands must run on Node 26 without Bun-only APIs.
- Put public entrypoints in `bin/`, internal tooling in `scripts/`, application orchestration in `lib/`, and focused tests and fixtures in the nearest owner's flat `test/` directory. Add `utils/` only for independently testable helpers.
- Run ESLint for code quality, standalone Prettier for formatting, and `bun run typecheck` separately. Start with `bun install --frozen-lockfile`.
- Keep application state in the server and use one shared API for CLI and TUI. Keep market data, execution, and decision boundaries separate.
- Keep research and user documentation in small Markdown files under `docs/decisions/`. Provider/execution/Jev work follows `docs/decisions/providers-and-jev.md`; analytics, sessions, corrections, and strategy configuration follow `docs/decisions/analytics-and-strategies.md`. Update the owning decision instead of duplicating its policy.
- Keep research proofs in their decision's scope and validate them through root lint, formatting, type checking, and `bun run test:research`. Do not add an independent development toolchain or runtime export for research.
- Expose one `mmm` command with explicit `server` and `tui` subcommands; keep their implementations separate. The Python/QuantConnect setup is retired; do not restore it as a supported runtime or migration source.
- Do not describe scaffold commands as functional server, trading, CLI, or TUI behavior until their owning issues implement and validate them.
