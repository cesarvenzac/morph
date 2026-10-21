# @cesarvenzac/morph

Morph any SVG into another without the spikes: icons, filled shapes, words, one shape into
several.

Most morphs look generated for the same few reasons: points paired by accident, moved in
straight lines, and corners that snap in. This pairs shapes by what they look like, moves each
one whole, rounds it halfway and draws it as a few smooth curves, so every frame between two
drawings looks drawn. Holes open and close where they should, colours mix as CSS mixes them, and
when one side has more shapes than the other they split and merge rather than pop. The two usual
ways are here too, for comparing.

The docs, with live examples, are at [cesarvenzac.com/morph](https://cesarvenzac.com/morph). The
three ways side by side are in [Icon morphs](https://cesarvenzac.com/lab/icon-morphs), and how it
works, measured, in [Morphs without spikes](https://cesarvenzac.com/blog/morphs-without-spikes).

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

`at(t)` draws any moment from `0` (the first side) to `1` (the second), each part as SVG path
data. Drive `t` however you animate: a spring, a tween, a scroll position, a slider.

Any SVG, filled or stroked, from markup:

```ts
import { morph, svg } from "@cesarvenzac/morph";

const m = morph(svg(heartMarkup), svg(starMarkup));
m.at(0.5); // [{ d, width, fill, color }, …]
```

Words, set in a font [opentype.js](https://github.com/opentypejs/opentype.js) has read:

```ts
import { morph, text } from "@cesarvenzac/morph";
import opentype from "opentype.js";

const font = opentype.parse(await (await fetch("/Inter.woff")).arrayBuffer());
const m = morph(text(font, "Hello"), text(font, "World"));
```

Then draw it. `svgOf` writes a frame as an SVG document, for a server, an `<img>` or a file;
`draw` puts a frame into an `<svg>` in the page, a path a part:

```ts
import { svgOf } from "@cesarvenzac/morph";
import { draw } from "@cesarvenzac/morph/dom";

svgOf(m, 0.5); // '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>'
draw(document.querySelector("svg")!, m.at(t), m.viewBox); // each frame
```

## Play it

When something changes, a press or a state, the drawing can spring to the next source. Changed
back mid-way, it turns back from where it is, at the speed it was going; sent somewhere new
mid-way, it goes on from the frame it's at. `MorphIcon` and `mount` change at once under
`prefers-reduced-motion`; with `motion`, call `jump()`.

In React:

```tsx
import { MorphIcon } from "@cesarvenzac/morph/react";
import { Menu, X } from "lucide";

<button onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>
  <MorphIcon icon={open ? X : Menu} />
</button>;
```

Without a framework:

```ts
import { mount } from "@cesarvenzac/morph/dom";

const icon = mount(button.querySelector("svg")!, Menu);
button.addEventListener("click", () => icon.to(open ? X : Menu));
```

Anywhere else (Svelte, Vue, a canvas, a game loop), `motion` is the same spring, pure, given
the time:

```ts
import { motion } from "@cesarvenzac/morph";

let icon = motion(Menu);
icon = icon.toward(X); // when it changes
icon = icon.step(1 / 60); // each frame, until icon.settled
icon.frame(); // its parts, to draw
```

## What it morphs

Either side can be any of these, and the two needn't match:

- **An icon**: SVG path data (`"M5 12h14M12 5v14"`), a list of it (one entry a stroke or more),
  or elements as Lucide writes its icons, `[tag, attributes][]`: anything from the `lucide`
  package as it is, and icons in the same shape from elsewhere (`path`, `line`, `polyline`,
  `polygon`, `circle`, `ellipse` and `rect` are read). Every element is a stroke on a 24-unit
  grid, so leave out any invisible ones (a bounding box).
- **SVG markup**, read by `svg(markup)`, with no DOM: `path`, `rect`, `circle`, `ellipse`,
  `line`, `polyline` and `polygon`, inside groups and nested `svg`s, transforms applied, with
  their fill, stroke, width, fill rule, caps, joins, opacity and `currentColor`, inline styles
  included. Gradients and patterns are read as the current colour; what isn't drawn as a path
  (text, images, `use`, clips, masks, filters, `defs`) is passed over. A shape with a fill and a
  stroke is two parts.
- **A word**, set by `text(font, string, { size?, color? })` in a font opentype.js has read (or
  anything with its `getPath`, `getPaths`, `getAdvanceWidth`, `unitsPerEm`, `ascender` and
  `descender`). Each glyph is a filled part; the package reads no font files itself. Where the
  font's shaping throws, as opentype.js 2.0 does on some fonts' features (Inter's and DejaVu's
  among them), the line is set glyph by glyph instead, through `charToGlyph` and
  `getKerningValue`: no ligatures, the same letters. opentype.js reads TrueType, OpenType and
  WOFF, not WOFF2.
- **A drawing** made by hand: `{ parts, viewBox, em? }`, each part
  `{ kind: "fill" | "stroke", d, color?, opacity?, width?, rule?, cap?, join? }`.

## Two sides on one canvas

Two icons are drawn on their 24-unit grid. Otherwise every frame is drawn on the first side's
canvas (`m.viewBox`), the second fitted into it as SVG fits a viewBox (centred, as large as fits).
Two drawings that both have an `em`, as words from `text` do, are taken as they are instead,
centred on each other, the canvas wide enough for both. An icon among drawings is stroked 2 wide, as Lucide draws it.

Inside, everything is scaled to a 24-unit grid, which the morph's distances (how far apart its
points sit, how round a corner gets halfway) are tuned for, and scaled back as it's drawn.

## Shapes, holes and paint

A drawing is pieces: strokes (each subpath of a stroked part), and filled islands (an outline and
the holes directly in it, found as SVG's fill rule finds them). Pieces are paired by their shape
(size, place and turn set aside), how far apart they are and how their sizes differ, the pairing
that costs least overall; a stroke pairs with a fill only when nothing fits better, and one then
crossfades into the other.
An island's holes are paired among themselves and move with it; a hole with no partner opens
from a point or closes into one.

Colours mix in OKLab, as CSS's `color-mix()` does, so a red becoming a blue passes through a
clear purple, between the two in lightness, not the dark one an sRGB mix gives. A colour the package can't read (the current colour, a CSS variable)
is mixed by the browser: the part's colour is then a `color-mix(in oklab, …)`. Opacity and stroke
widths are interpolated; caps and joins are the nearer side's.

## Different numbers of shapes

`extra` says what becomes of the pieces one side has more of:

- `"auto"` (the default): small pieces lying along a much bigger one join it (three dots
  becoming a line, a loader's rays a circle); anything else gathers.
- `"split"`: every extra piece joins the nearest piece of its kind on the other side, so one
  shape splits into several, or several merge into one. A stroke is shared out between them, a
  stretch each; a filled shape is cut into parts, one each, about as big as each, so a heart
  breaks into the letters of a word and four squares grow into one. A stroke paired with a fill
  would only crossfade, so here they part when either has a piece of its kind to join: letters
  becoming a sun merge into its disc while its rays grow. (A filled shape with holes isn't cut:
  each piece becomes the whole of it, the copies fading as they land.)
- `"gather"`: each extra piece gathers into a dot as the morph goes on, or grows from one.

```ts
morph(triangle, twoBars, { extra: "split" }); // a play button dividing into pause
```

## API

### `morph(from, to, options?)`

`options` is the way to morph (`"soft"`, `"even"`, `"index"` or `Steps`) or
`{ way?, extra? }`. `way` is `"soft"` by default; `"even"` is evenly resampled points moved in
straight lines, as flubber does, drawn as a polygon; `"index"` is commands paired in the order
they were written, as most libraries do. Returns a `Morph`:

- `slots`: how many parts every frame has (some empty at the ends).
- `viewBox`: the canvas every frame is drawn on, `[x, y, width, height]`.
- `at(t)`: the frame at `t` as parts. At `0` and `1`, exactly the two sides.
- `shapes(t)`: the same frame as anchors and handles (`{ nodes, closed, width, holes? }[]`), as an
  editor shows a path. `at` is drawn from them, so the two always agree.
- `points(t)`: each part's outline points before they're drawn as curves.

A part is `{ d, width }` for icons, `width` a share of the icon's stroke width (a stroke
shrinking away narrows to `0`). For drawings it's `{ d, width, fill, color?, opacity?, cap?,
join? }`: `width` the stroke's width in the canvas's units (`0` for a fill), `fill` how filled it
is (`0` a stroke, `1` a fill). Draw fills with `fill-rule="evenodd"`, as `attributesOf` does: an
island's holes are in its path data.

### `svg(markup)`, `text(font, string, options?)`

Read a drawing (above).

### `attributesOf(part, { strokeWidth? })`, `svgOf(morph, t, options?)`

A part as a `<path>`'s attributes (`fill`, `stroke`, `stroke-width`, `fill-rule`…), an icon's
`strokeWidth` wide at a width of 1 (2, unless said). `svgOf` writes the frame at `t` as an SVG
document; `{ color, width, height }` set the current colour and a size.

### `motion(source, options?)`

A drawing at rest on `source`, immutable: `toward(next)` heads for another source (back the way it
came if it came from there, on from the frame it's at otherwise), `step(seconds)` moves it along
its spring, `jump()` puts it where it's headed, and `frame()` is what it draws. It also says its
`morph`, `t`, `velocity`, `target`, `source`, `viewBox` and whether it's `settled`. Options are
the morph's (`way`, `extra`) and its `spring`, `{ stiffness, damping }`: `PRESS` unless said, as
near critically damped as makes no overshoot.

### `@cesarvenzac/morph/react`

- `<MorphIcon icon size? strokeWidth? spring? way? extra? reducedMotion? />`: an icon, or any
  drawing, that springs to the next whenever `icon` changes. Hidden from assistive tech unless
  it's given an `aria-label` (name the button it's in instead); any `<svg>` prop goes on its
  `<svg>`.
- `useMorph(from, to, options?)`: a morph kept across renders, made again only when a side or the
  options say something new (icons written inline are the same icons).
- `<MorphFrame morph t size? strokeWidth? />`: a morph drawn at `t`, for one you drive yourself.
- `useMorphing(source, options?)`: `MorphIcon`'s motion without its `<svg>`: `{ parts, viewBox,
  motion }`.

React 18 or later, as an optional peer dependency; they're client components.

### `@cesarvenzac/morph/dom`

- `mount(svg, source, options?)`: makes an `<svg>` show `source`; `to(next)` springs there,
  `set(next)` shows it at once, `stop()` stops, and `motion` is where it is.
- `draw(svg, parts, viewBox?, { strokeWidth? })`: parts into an `<svg>`, a `<path>` each, made and
  taken away as their number changes, with no attribute left over from the last frame.

### `Steps`, `EVENLY`, `SOFTLY`

Soft is even with four steps on, each switchable alone, to show what each one does:

```ts
import { EVENLY, morph } from "@cesarvenzac/morph";

morph(Plus, X, { ...EVENLY, shape: true }); // even, but paired by shape
```

- `shape`: pair points by the shape they make, not by how far they travel.
- `whole`: move each piece whole (its place, size and turn), apart from its shape.
- `round`: blur each outline along its length, most halfway, so a corner arrives rounded.
- `curves`: draw fitted cubics rather than a polygon, sharp only at an end's own corners.

`SOFTLY` is all four on; `EVENLY` none.

### `nodesData(nodes, closed, digits?)`

A shape's nodes back as path data: for drawing anchors and handles, or a frame from `shapes`.

## Cost

Building a morph is the costly part: about 8 ms for a pair of Lucide icons (15 ms for nine pairs
in ten), and about 100 ms for two words of a dozen letters, measured in Node on one core of a
2.1 GHz server. Do it once and keep the morph, not the sources. A frame then takes a quarter of a
millisecond for icons, and 2 to 4 ms for words.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run check # packed as npm publishes it, then installed and run as a user's would be
```

This repository is a copy. The package is developed inside the site it was made for, whose
repository is private, and every release copies it here and publishes it to npm from here, with
provenance. Issues are welcome; pull requests are read, and their changes made at the source.

## Licence

MIT. The examples use [Lucide](https://lucide.dev)'s icons (ISC).
