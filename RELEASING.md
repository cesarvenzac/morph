# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) and the [Release workflow](.github/workflows/release.yml). Only `@morphfx/core` and `@morphfx/react` are published; the apps are private.

## Everyday flow

1. Pull requests that change a published package include a changeset (`pnpm changeset`).
2. When they are merged into `main`, the Release workflow opens (or updates) a **"chore: version packages"** pull request that bumps versions and writes changelogs.
3. Merging that pull request publishes the new versions to npm, with [provenance](https://docs.npmjs.com/generating-provenance-statements), and creates GitHub releases.

## Pre-releases (current mode)

The repository is in Changesets **pre-release mode** with the `next` tag (see `.changeset/pre.json`). Versions are published as `0.1.0-next.0`, `0.1.0-next.1`… under the `next` dist-tag, so `npm install @morphfx/react` doesn't pick them up by accident. Install them with `npm install @morphfx/react@next`.

To publish a stable release, leave pre-release mode in a pull request:

```sh
pnpm changeset pre exit
```

## One-time setup (before the first release)

npm Trusted Publishing (publishing from GitHub Actions without a long-lived token) can only be configured for a package that already exists, so the first version is published with a short-lived token.

1. **GitHub:** in the repository's *Settings → Actions → General*, enable **Allow GitHub Actions to create and approve pull requests** (the workflow opens the version pull request).
2. **npm token:** on npmjs.com, create a **granular access token** with *Read and write* permission on the `@morphfx` scope (or the `morphfx` organization), expiring in 7 days. Add it to the repository as an Actions secret named `NPM_TOKEN`.
3. **Release:** merge into `main`, then merge the "chore: version packages" pull request. The workflow publishes `@morphfx/core` and `@morphfx/react`.
4. **Trusted Publishing:** on npmjs.com, open each package's *Settings → Trusted publishing*, choose GitHub Actions, and enter owner `cesarvenzac`, repository `morph`, workflow `release.yml`. A new configuration expires after 48 hours unless a publish uses it, so do this shortly before the next release.
5. **Clean up:** delete the `NPM_TOKEN` secret and revoke the token. Later releases authenticate with Trusted Publishing.

If the repository moves to a GitHub organization, update the Trusted Publishing settings and the `repository` field of each `package.json`.
