# Agent guide

Conventions for AI coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Project

morphfx is a morphing library: a framework-agnostic TypeScript core (`packages/core`) plus React, React Native and Skia bindings planned on top of it. Read [RFC 0001](docs/rfcs/0001-project-foundations.md) before making design decisions.

## Commands (from the repo root)

- Install: `pnpm install`
- Check everything: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Auto-fix lint and formatting: `pnpm lint:fix`
- Package shape and size: `pnpm check:packages && pnpm size`

## Rules

- `@morphfx/core` has **zero runtime dependencies** and uses **no platform APIs** (no DOM, no Node built-ins). It must run in browsers, Node, React Server Components, Hermes and Reanimated worklets.
- Exported functions need **explicit return types** (`isolatedDeclarations` is on).
- Every behavior change comes with tests. Use `fast-check` for invariants (for example, "output always parses", "no NaN").
- Formatting is Biome's: 2 spaces, single quotes, no semicolons, 100 columns. Run `pnpm lint:fix` instead of formatting by hand.
- User-facing changes to a published package need a changeset (`pnpm changeset`).
- PR titles follow Conventional Commits (`feat(core): …`, `fix: …`, `docs: …`).
- Don't add dependencies, packages or public APIs without an issue or RFC agreeing on them.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
