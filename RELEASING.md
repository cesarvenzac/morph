# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) and the [Release workflow](.github/workflows/release.yml). Only the packages (`@morphfx/core`, `@morphfx/react`, `@morphfx/react-native`) are published; the apps are private.

## Everyday flow

1. Pull requests that change a published package include a changeset (`pnpm changeset`).
2. When they are merged into `main`, the Release workflow opens (or updates) a **"chore: version packages"** pull request that bumps versions and writes changelogs.
3. Merging that pull request publishes the new versions to npm, with [provenance](https://docs.npmjs.com/generating-provenance-statements), and creates GitHub releases.

## Pre-releases (current mode)

The repository is in Changesets **pre-release mode** with the `next` tag (see `.changeset/pre.json`). Versions are published as `0.1.0-next.0`, `0.1.0-next.1`… under the `next` dist-tag. Install them with `npm install @morphfx/react@next`.

The first release, `0.1.0-next.0`, also got the `latest` tag, as a package's first version does. Later pre-releases are published under `next` only, so until the first stable release a plain `npm install @morphfx/react` keeps installing `0.1.0-next.0`.

To publish a stable release, leave pre-release mode in a pull request:

```sh
pnpm changeset pre exit
```

## Publishing setup

The workflow has no npm token. `pnpm publish` authenticates with [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), which also attaches the provenance attestation. This is configured on npmjs.com, in each package's *Settings → Trusted publishing* (all three packages): GitHub Actions, owner `cesarvenzac`, repository `morph`, workflow `release.yml`.

- **A new configuration expires after 48 hours unless a publish uses it** (once one has, it no longer expires). If the first release after configuring it fails to authenticate, recreate the configuration on each package, then re-run the failed Release workflow.
- If the repository moves to a GitHub organization, update the configuration and the `repository` field of each `package.json`.
- The workflow opens the version pull request, which requires **Allow GitHub Actions to create and approve pull requests** in the repository's *Settings → Actions → General*. Workflows don't run on pull requests opened by GitHub Actions, so that pull request shows no CI checks: it only changes versions and changelogs, and the Release workflow builds everything before publishing.

The first version, `0.1.0-next.0`, was published with a short-lived token, because Trusted Publishing can only be configured for a package that already exists. It has no provenance attestation.
