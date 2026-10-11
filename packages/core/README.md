# @morphfx/core

Framework-agnostic SVG path morphing engine: zero dependencies, runs in browsers, Node, React Server Components, Hermes and Reanimated worklets.

> **Status: in development, not published yet.** The morphing API (`morph()`) is being built. What exists today is the foundation it builds on: a spec-compliant path parser and a normalizer to cubic Béziers.

## Available today

```ts
import { normalize, parsePath, serialize } from '@morphfx/core'

// Parse SVG path data into commands (spec-compliant, with precise errors)
parsePath('M10 10h5a2 2 0 01 2 2z')
// → [{ type: 'M', values: [10, 10] }, { type: 'h', values: [5] }, …]

// Convert any path into absolute cubic Béziers, the representation morphs work on
const path = normalize('M0 0 L30 0 A15 15 0 0 1 0 0 Z')
// → [{ points: [0, 0, 10, 0, 20, 0, 30, 0, …], closed: true }]

// Write it back as compact path data
serialize(path, { precision: 2 })
// → 'M0 0C10 0 20 0 30 0…Z'
```

## Coming next

```ts
import { morph } from '@morphfx/core'

const mix = morph(playIcon, pauseIcon) // (t: number) => string
mix(0.5) // the shape halfway between the two
```

See the [design RFC](../../docs/rfcs/0001-project-foundations.md) for the full plan.

## License

[MIT](../../LICENSE)
