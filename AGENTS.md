# Repository guidance

- Keep MMM as one TypeScript/ESM package. Bun runs development tools; built consumer commands must run on Node 26 without Bun-only APIs.
- Put public entrypoints in `bin/`, internal tooling in `scripts/`, application orchestration in `lib/`, and focused tests and fixtures in the nearest owner's flat `test/` directory. Add `utils/` only for independently testable helpers.
- Run ESLint for code quality, standalone Prettier for formatting, and `bun run typecheck` separately. Start with `bun install --frozen-lockfile`.
- Keep application state in the server and use one shared API for CLI and TUI. Keep market data, execution, and decision boundaries separate.
- Keep research and user documentation in small Markdown files. Preserve the Python experiments on `origin/scaffold1`; do not import them into this package.
- Do not describe scaffold commands as functional server, trading, CLI, or TUI behavior until their owning issues implement and validate them.
