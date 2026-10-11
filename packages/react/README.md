# @morphfx/react

SVG path morphing for React and Next.js, powered by [`@morphfx/core`](../core).

> **Status: in development, not published yet.**

- **Change `d`, it morphs.** Works between arbitrary shapes: different point counts, several pieces, holes.
- **Interruptible.** Changing `d` mid-morph continues from the shape on screen; going back reverses smoothly and keeps the spring's momentum.
- **Fast.** Frames are written straight to the DOM: React doesn't re-render while a morph plays.
- **Server-rendered.** The first shape is in the HTML; works in the Next.js App Router (the package is marked `'use client'`, so you can use it from Server Components).
- **Accessible.** Honors the operating system's reduced-motion setting by default.
- **Small:** about 1 kB on top of `@morphfx/core`. React 19 or later.

## Usage

```tsx
import { MorphPath } from '@morphfx/react'

export function PlayPause({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
      <MorphPath d={playing ? PAUSE : PLAY} fill="currentColor" />
    </svg>
  )
}
```

`<MorphPath>` renders a real `<path>`: every other prop (`fill`, `stroke`, `className`, `ref`, event handlers…) is passed through.

### Transitions

```tsx
<MorphPath d={d} transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }} />
<MorphPath d={d} transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }} />
```

| Transition | Options |
|---|---|
| `spring` (default) | `duration` (perceived, in seconds, default `0.4`), `bounce` (0 to 1, default `0`), or physical `stiffness`, `damping`, `mass`; `delay` |
| `tween` | `duration` (seconds, default `0.3`), `ease` (`'linear'`, `'easeIn'`, `'easeOut'`, `'easeInOut'`, a cubic Bézier `[x1, y1, x2, y2]` or a function), `delay` |

The shape mirrors Motion's `transition` prop.

### Events and reduced motion

```tsx
<MorphPath
  d={d}
  onMorphStart={() => {}}
  onMorphComplete={() => {}} // not called when a morph is interrupted
  reducedMotion="user" // 'user' (default): follow the OS setting; 'always': never animate; 'never': always animate
/>
```

### Controlled by progress (scroll, gestures, sliders)

Pass `paths` and a `progress` instead of `d`. `progress` can be a number, or any value with `get()` and `on('change', callback)`, such as a Motion `MotionValue`, which updates the shape without re-rendering:

```tsx
import { useScroll } from 'motion/react'

const { scrollYProgress } = useScroll()
<MorphPath paths={[circle, square, star]} progress={scrollYProgress} />
```

### `useMorph`

Returns a memoized `(t) => d` interpolator, to use with any animation library:

```tsx
import { motion, useTransform } from 'motion/react'
import { useMorph } from '@morphfx/react'

const mix = useMorph([circle, star])
const d = useTransform(progress, mix)
return <motion.path d={d} />
```

### Morph options

`options` is passed to `@morphfx/core` (`precision`, `align`, `maxSegmentLength`):

```tsx
<MorphPath d={d} options={{ precision: 2 }} />
```

## Notes

- Use the same `viewBox` (coordinate space) for every shape you morph between.
- A component is either animated (`d`) or controlled (`paths` + `progress`); don't switch between the two on the same element.
- An invalid `d` is shown as-is without animating, and reported with `console.error`.

See the [Next.js example](../../apps/next-example) for a working app.

## License

[MIT](../../LICENSE)
