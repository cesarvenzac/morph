# Morph

> Morph anything into anything, starting with SVG shapes, with one API for **React / Next.js** and **React Native / Expo**.

**Status: early design phase.** Nothing is published yet.

## What we're building

An open-source morphing engine and set of bindings:

- **Core:** a framework-agnostic, zero-dependency TypeScript engine that morphs between *arbitrary* SVG paths (different point counts, multiple subpaths, holes) while keeping curves smooth.
- **React (web / Next.js):** `<MorphPath d={…} />` that animates whenever `d` changes. It is SSR-friendly and honors reduced motion.
- **React Native (Expo):** the same API, running on the UI thread with `react-native-svg` + Reanimated, or with Skia.
- **Bring your own animation library:** Motion, Reanimated, GSAP, react-spring, or the tiny built-in driver.

Text, image and UI morphing may come later.

## Design discussion

Start with **[RFC 0001: Project foundations](docs/rfcs/0001-project-foundations.md)**. It covers the landscape, the algorithm, the API, the stack, the contribution model, the docs website, the roadmap and the open questions.
Feedback is welcome through PR comments or issues.

## License

To be decided (MIT proposed in the RFC).
