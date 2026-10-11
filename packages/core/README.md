# @morphfx/core

Framework-agnostic SVG path morphing engine: zero dependencies, runs in browsers, Node, React Server Components, Hermes and Reanimated worklets.

> **Status: in development, not published yet.** The API below works and is tested, but may still change before `0.1.0`.

- Morphs between **arbitrary** paths: different point counts, several subpaths, holes, open and closed paths.
- **Keeps curves** as cubic Béziers instead of turning them into polygons.
- Points are paired **by relative position along the outline**, so corners of both shapes keep a counterpart and shapes don't spin while morphing.
- **Prepare once, tween cheap:** the expensive matching runs once; each frame is a single loop over numbers.

## Usage

```ts
import { morph } from '@morphfx/core'

const mix = morph(playIcon, pauseIcon) // (t: number) => string
path.setAttribute('d', mix(0.5)) // the shape halfway between the two
```

`t = 0` gives the first shape and `t = 1` the second. Values outside `[0, 1]` extrapolate, which suits overshooting springs.

### Keyframes

```ts
const mix = morph([circle, square, star]) // t = 0.5 gives the square
```

### With Motion

```tsx
import { motion, useScroll, useTransform } from 'motion/react'
import { mixer } from '@morphfx/core'

const { scrollYProgress } = useScroll()
const d = useTransform(scrollYProgress, [0, 1], [circle, star], { mixer })
return <motion.path d={d} />
```

### With any other animation library

```ts
const mix = morph(a, b)
const state = { t: 0 }
gsap.to(state, { t: 1, duration: 0.6, onUpdate: () => path.setAttribute('d', mix(state.t)) })
```

### Preparing ahead of time

`morph()` is `prepare()` followed by `interpolate()`. The prepared morph only contains numbers, so you can compute it on a server, at build time, or on another thread, and send it as JSON:

```ts
import { interpolate, prepare } from '@morphfx/core'

const prepared = prepare(a, b) // expensive, JSON-serializable
const mix = interpolate(prepared) // cheap
```

## Options

| Option | Default | Description |
|---|---|---|
| `precision` | `3` | Decimals written for each coordinate. Lower values give shorter strings |
| `align` | `'auto'` | `'auto'` pairs subpaths by position and size, normalizes winding, and pairs points along the outlines. `'none'` keeps subpaths in order with their start points and directions, for shapes authored to correspond |
| `maxSegmentLength` | off | Splits segments longer than this (in user units) before pairing points |

## How it works

1. **Parse** the path data (spec-compliant, with precise error positions) and **normalize** every segment to an absolute cubic Bézier.
2. **Match subpaths** between the two shapes by position and size (outer contours with outer contours, holes with holes). A subpath without a partner grows from, or shrinks into, its centroid.
3. **Normalize winding** so paired subpaths never turn inside out.
4. **Pair points by relative arc length**, starting closed outlines at the best offset, then split each outline (exactly) at the other's anchors.
5. Each frame, **interpolate** linearly and write path data.

See the [design RFC](../../docs/rfcs/0001-project-foundations.md) for details.

## Animation timing

`@morphfx/core/animate` has the tween and spring math used by the framework bindings, with no timers or platform APIs, so any frame loop can drive it:

```ts
import { createTransition } from '@morphfx/core/animate'

const step = createTransition({ type: 'spring', duration: 0.4, bounce: 0.2 })
const mix = morph(a, b)
const start = performance.now()
requestAnimationFrame(function frame(now) {
  const { value, done } = step((now - start) / 1000)
  path.setAttribute('d', mix(value))
  if (!done) requestAnimationFrame(frame)
})
```

## Lower-level helpers

`parsePath(d)` parses path data into commands. `normalize(d)` converts it to absolute cubic Béziers. `serialize(path)` writes it back as path data.

## Known limitations

- Shapes that differ mostly by rotation (plus → ×) twist a little instead of rotating.
- When one shape has more pieces than the other (play → pause), the extra pieces grow from their own centre rather than splitting off.
- A shape nested inside another subpath that winds in the *same* direction is treated as a hole. This only changes rendering for unusual paths that rely on the `nonzero` fill rule to fill such a shape twice.

## License

[MIT](../../LICENSE)
