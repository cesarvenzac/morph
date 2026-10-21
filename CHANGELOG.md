# Changelog

## 1.0.0

Morph takes any SVG now, not only stroked icons: filled shapes in their colours, words set in a
font, one shape into several. And it plays, on a spring, in React, in the page or on any clock.

- **Any SVG, either side.** `svg(markup)` reads SVG with no DOM: `path`, `rect`, `circle`,
  `ellipse`, `line`, `polyline` and `polygon`, in groups and nested `svg`s, transforms applied,
  with their fill, stroke, width, fill rule, caps, joins and opacity. `text(font, string)` sets a
  word in a font opentype.js has read. A drawing can be made by hand too, `{ parts, viewBox }`.
- **Filled shapes and their holes.** A filled outline moves with the holes in it. Holes pair
  among themselves, and one with no partner opens from a point or closes into one. A stroke pairs
  with a fill only when nothing fits better, and crossfades into it.
- **Paint that mixes.** Colours mix in OKLab, as CSS's `color-mix()` does, so a red becoming a
  blue passes through a clear purple. A colour the package can't read (the current colour, a CSS
  variable) is left to the browser, as a `color-mix()`. Opacity and stroke widths follow.
- **More shapes on one side.** `morph(from, to, { extra })` says what becomes of the pieces one
  side has more of: `"split"` shares one shape out among several, or merges several into one;
  `"gather"` shrinks each into a dot, or grows it from one; `"auto"`, the default, joins small
  pieces lying along a much bigger one and gathers the rest.
- **One canvas.** Every frame is drawn on the first side's canvas, `m.viewBox`, the second fitted
  into it; two words are centred on each other.
- **Drawing a frame.** `attributesOf(part)` gives a part's `<path>` attributes, and `svgOf(m, t)`
  writes the frame at `t` as an SVG document.
- **Playing it.** `motion(source)` springs to each new source, turning back from where it is when
  sent back mid-way: pure and immutable, for any clock. In `@cesarvenzac/morph/react` (React 18
  or later, an optional peer), `MorphIcon`, `useMorphing`, `useMorph` and `MorphFrame`; in
  `@cesarvenzac/morph/dom`, `mount` and `draw`. `MorphIcon` and `mount` change at once under
  `prefers-reduced-motion`.

### Upgrading from 0.1

Nothing to change. `morph(from, to, way)` takes a way as before, and two icons give `{ d, width }`
a part as before (`Stroke` is now `Part`, which adds optional paint for drawings). They draw as
they did, except where one side has small pieces lying along a much bigger one, as three dots
becoming a line: those now join it rather than gather into dots. `{ extra: "gather" }` keeps
0.1's way.

## 0.1.1

No change to the code: the first version published through npm's trusted publishing, with
provenance.

## 0.1.0

The first release: one stroked icon into another, three ways (`"soft"`, `"even"` and `"index"`),
and the soft way's four steps, each switchable alone.
