# @morphfx/react-native

SVG path morphing for React Native and Expo, powered by [`@morphfx/core`](../core). Frames are computed on the UI thread with [Reanimated](https://docs.swmansion.com/react-native-reanimated/) and drawn by [`react-native-svg`](https://github.com/software-mansion/react-native-svg), or by [Skia](https://shopify.github.io/react-native-skia/).

> **Status: in development, not published yet.**

Same API as [`@morphfx/react`](../react): change `d` and it morphs; morphs can be interrupted, and going back reverses with the spring's momentum.

## Requirements

React Native's New Architecture, `react-native-reanimated` 4 (with `react-native-worklets`), `react-native-svg` 15. Expo SDK 54 or later works out of the box: its Babel preset already runs the Reanimated plugin.

## Usage

```tsx
import Svg from 'react-native-svg'
import { MorphPath } from '@morphfx/react-native'

export function PlayPause({ playing }: { playing: boolean }) {
  return (
    <Svg viewBox="0 0 24 24" width={24} height={24}>
      <MorphPath d={playing ? PAUSE : PLAY} fill="black" />
    </Svg>
  )
}
```

`<MorphPath>` renders a `react-native-svg` `<Path>`, and every other prop (`fill`, `stroke`, `ref`…) is passed through.

### Transitions, events and reduced motion

Exactly as in `@morphfx/react`:

```tsx
<MorphPath
  d={d}
  transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }} // or { type: 'tween', duration: 0.3, ease: 'easeInOut' }
  reducedMotion="user" // 'user' (default): follow the OS setting; 'always': never animate; 'never': always animate
  onMorphStart={() => {}}
  onMorphComplete={() => {}}
/>
```

Springs use the same physics as on the web. Custom easing functions must be worklets (start them with a `'worklet'` directive).

### Driven by a shared value (gestures, scroll)

Pass `paths` and a Reanimated shared value: the shape follows it on the UI thread, without re-rendering.

```tsx
const progress = useSharedValue(0)
// …update progress from a gesture, a scroll handler or an animation
<MorphPath paths={[circle, square, star]} progress={progress} />
```

### Skia

For shapes with many points, or when you already draw with Skia, `useMorphPath` returns an animated Skia path. Matching happens once in JavaScript; each frame is a native Skia path interpolation.

```tsx
import { Canvas, Path } from '@shopify/react-native-skia'
import { useMorphPath } from '@morphfx/react-native/skia'

const path = useMorphPath([circle, star], progress)

<Canvas style={{ width: 200, height: 200 }}>
  <Path path={path} color="tomato" />
</Canvas>
```

`@shopify/react-native-skia` 2 or later is an optional peer dependency, only needed for this subpath.

## Notes

- Use the same `viewBox` (coordinate space) for every shape you morph between.
- A component is either animated (`d`) or controlled (`paths` + `progress`); don't switch between the two on the same element.

See the [Expo example](../../apps/expo-example) for a working app.

## License

[MIT](../../LICENSE)
