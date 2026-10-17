# @cesarvenzac/morph

Morph one stroked icon into another without the spikes.

Most icon morphs look generated for the same few reasons: points paired by accident, moved in
straight lines, and corners that snap in. This pairs strokes by their shape, moves each one
whole, rounds it halfway and draws it as a few smooth curves, so every frame between two icons
looks drawn. The two usual ways are here too, for comparing.

See it, and the three ways side by side, in [Icon morphs](https://cesarvenzac.com/lab/icon-morphs);
how it works is in [Morphs without spikes](https://cesarvenzac.com/blog/morphs-without-spikes).

```sh
npm install @cesarvenzac/morph
```

## Use

```ts
import { morph } from "@cesarvenzac/morph";
import { Plus, X } from "lucide";

const m = morph(Plus, X); // the matching happens once, here
m.at(0.5); // [{ d: "M4.88 14.95C…", width: 1 }, …]: one path per stroke
```

`at(t)` draws any moment from `0` (the first icon) to `1` (the second), each stroke as SVG path
data. Drive `t` however you animate: a spring, a tween, a scroll position, a slider.

In React:

```tsx
import { morph, type Icon } from "@cesarvenzac/morph";
import { useMemo } from "react";

export function MorphIcon({ from, to, t }: { from: Icon; to: Icon; t: number }) {
  const m = useMemo(() => morph(from, to), [from, to]);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {m.at(t).map((stroke, k) => (
        <path key={k} d={stroke.d} strokeWidth={2 * stroke.width} />
      ))}
    </svg>
  );
}
```

Without a framework:

```ts
const svg = document.querySelector("svg")!;
const m = morph(Plus, X);
const paths = Array.from({ length: m.slots }, () =>
  svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path")),
);

function draw(t: number) {
  m.at(t).forEach((stroke, k) => {
    paths[k].setAttribute("d", stroke.d);
    paths[k].setAttribute("stroke-width", String(2 * stroke.width));
  });
}
```

## Icons

An icon is any of:

- SVG path data: `"M5 12h14M12 5v14"`
- a list of it, one entry a stroke or more: `["M5 12h14", "M12 5v14"]`
- elements as Lucide writes its icons, `[tag, attributes][]`: anything from the `lucide`
  package as it is, and icons in the same shape from elsewhere. `path`, `line`, `polyline`,
  `polygon`, `circle`, `ellipse` and `rect` are read.

It morphs strokes, not filled shapes: icons drawn with `fill="none"` and a stroke, as Lucide's
and Feather's are. Every element is a stroke, so leave out any invisible ones (a bounding box).
Its distances (how far apart points sit, how round a corner gets halfway) are tuned for a
24-unit grid; scale other icons to 24 first.

## API

### `morph(from, to, way?)`

`way` is `"soft"` (the default), `"even"` (evenly resampled points moved in straight lines, as
flubber does, drawn as a polygon), `"index"` (commands paired in the order they were written,
as most libraries do), or `Steps` (below). Returns a `Morph`:

- `slots`: how many strokes every frame has. A stroke one icon has and the other doesn't
  gathers into a dot and shrinks away, or grows from one.
- `at(t)`: the frame at `t` as `{ d, width }[]`, `width` a share of the icon's stroke width
  (a stroke shrinking away narrows to `0`). At `0` and `1`, exactly the two icons.
- `shapes(t)`: the same frame as anchors and handles (`{ nodes, closed, width }[]`), as an editor
  shows a path. `at` is drawn from them, so the two always agree.
- `points(t)`: the frame's points before they're drawn as curves.

### `Steps`, `EVENLY`, `SOFTLY`

Soft is even with four steps on, each switchable alone, to show what each one does:

```ts
import { EVENLY, morph } from "@cesarvenzac/morph";

morph(Plus, X, { ...EVENLY, shape: true }); // even, but paired by shape
```

- `shape`: pair points by the shape they make, not by how far they travel.
- `whole`: move each stroke whole (its place, size and turn), apart from its shape.
- `round`: blur each stroke along its length, most halfway, so a corner arrives rounded.
- `curves`: draw fitted cubics rather than a polygon, sharp only at an end's own corners.

`SOFTLY` is all four on; `EVENLY` none.

### `nodesData(nodes, closed)`

A shape's nodes back as path data: for drawing anchors and handles, or a frame from `shapes`.

## Cost

Building a morph is the costly part, about 15 ms for a pair of Lucide icons (once, so keep the
morph, not the icons); a frame is then about 0.2 ms. Measured in Node on a laptop.

## Licence

MIT. The examples use [Lucide](https://lucide.dev)'s icons (ISC).
