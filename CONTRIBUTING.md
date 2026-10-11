# Contributing to morphfx

Thanks for your interest in morphfx! This guide explains how to set up the repo, the rules for changes, and how releases work. The design behind the project lives in [RFC 0001](docs/rfcs/0001-project-foundations.md).

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requirements:

- **Node.js 24** (see [`.nvmrc`](.nvmrc); anything ≥ 22.18 works)
- **pnpm**, at the version pinned in `package.json` (`packageManager`). The easiest way to get it is `corepack enable`.

```sh
git clone https://github.com/cesarvenzac/morph.git
cd morph
pnpm install
pnpm build
pnpm test
```

## Repository layout

```
packages/
  core/          @morphfx/core: framework-agnostic geometry engine (zero dependencies)
fixtures/        shapes and morph pairs shared by the test suites
scripts/         development tools (filmstrip renderer)
docs/rfcs/       design decisions
.changeset/      pending release notes
```

The React, React Native and docs packages will be added as the [roadmap](docs/rfcs/0001-project-foundations.md#12-roadmap) progresses.

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm build` | Builds every package (tsdown, ESM + CJS + types) |
| `pnpm test` | Runs every test suite (Vitest) |
| `pnpm typecheck` | Type-checks every package |
| `pnpm lint` / `pnpm lint:fix` | Lints and checks formatting (Biome) / fixes what can be fixed |
| `pnpm check:packages` | Validates published package shape (publint, Are The Types Wrong) |
| `pnpm size` | Checks bundle size budgets (size-limit) |
| `pnpm bench` | Runs the performance benchmarks of `@morphfx/core` |
| `pnpm filmstrip` | Renders every fixture morph into `.filmstrip/index.html` to review quality by eye |
| `pnpm changeset` | Adds a changeset describing your change |

Inside a package, `pnpm dev` rebuilds on change and `pnpm test:watch` reruns tests.

## Making a change

1. **Open or find an issue first** for anything bigger than a small fix, so we can agree on the approach. Big changes (a new package, a breaking API change, a new morph type) need an [RFC](#rfcs).
2. Create a branch from `main`.
3. Make your change **with tests**. Geometry code is easy to get subtly wrong. Prefer property-based tests (`fast-check`) for invariants, plus targeted tests for edge cases.
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` locally.
5. **Add a changeset** if the change affects users of a published package: run `pnpm changeset`, pick the packages and the bump type, and write a short user-facing summary. Docs-only, test-only and tooling changes don't need one.
6. Open a pull request. Its **title must follow [Conventional Commits](https://www.conventionalcommits.org/)** (`feat(core): …`, `fix(react): …`, `docs: …`, `chore: …`) because PRs are squash-merged and the title becomes the commit message.

### Rules for `@morphfx/core`

- **No runtime dependencies.**
- **No platform APIs** (`window`, `document`, `DOMParser`, Node built-ins). The core must run in browsers, Node, React Server Components, Hermes and Reanimated worklets.
- **Mind the hot path.** Code that runs every frame must avoid allocations where possible and must stay free of closures over non-serializable values (it will run inside worklets).
- **Explicit types on exports.** The repo uses `isolatedDeclarations`, so exported functions need explicit return types.

### Reporting a bad morph

If a morph looks wrong, open an issue with **both path strings** (or SVG files) and what you expected. Every confirmed case becomes a permanent regression fixture in [`fixtures/`](fixtures/README.md).

### Changing the morphing algorithm

Run `pnpm filmstrip` before and after your change and compare the pages. Tests check that morphs are exact at both ends; only your eyes can check that the in-between shapes look good.

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets):

1. Changesets merged into `main` accumulate in a **"chore: version packages"** PR, which the release workflow opens and keeps up to date.
2. Merging that PR publishes the new versions to npm with provenance, through npm Trusted Publishing (no long-lived tokens), and creates GitHub releases.

Packages stay `"private": true` until they are ready for their first release; private packages are never published.

## RFCs

For significant changes, open a PR that adds `docs/rfcs/NNNN-short-title.md`, using [RFC 0001](docs/rfcs/0001-project-foundations.md) as a model. Discussion happens on the PR. It is merged once accepted, or closed if rejected.

## AI-assisted contributions

AI tools are welcome. You are responsible for every line you submit: understand it, test it, and make sure you have the right to contribute it. Conventions for coding agents are in [`AGENTS.md`](AGENTS.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
