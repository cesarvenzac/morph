# morphfx

> Morph anything into anything, starting with SVG shapes, with one API for **React / Next.js** and **React Native / Expo**.

**Status: early development.** Nothing is published on npm yet.

## What we're building

An open-source morphing engine and set of bindings:

| Package | What it is | Status |
|---|---|---|
| [`@morphfx/core`](packages/core) | Framework-agnostic, zero-dependency TypeScript engine that morphs between *arbitrary* SVG paths (different point counts, multiple subpaths, holes) while keeping curves smooth, plus tween and spring timing (`@morphfx/core/animate`) | Works and is tested; not published yet |
| [`@morphfx/react`](packages/react) | `<MorphPath d={…} />` for React and Next.js: animates whenever `d` changes, interruptible, server-rendered, honors reduced motion | Works and is tested; not published yet |
| `@morphfx/react-native` | The same API for React Native and Expo, running on the UI thread with `react-native-svg` + Reanimated, or with Skia (`/skia`) | Planned |

Bring your own animation library (Motion, Reanimated, GSAP, react-spring), or use the small built-in driver. Text, image and UI morphing may come later.

## Design

Start with **[RFC 0001: Project foundations](docs/rfcs/0001-project-foundations.md)**. It covers the landscape, the algorithm, the API, the stack, the contribution model, the docs website, the roadmap and the decisions taken so far.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Quick start:

```sh
pnpm install
pnpm build
pnpm test
```

## License

[MIT](LICENSE)
