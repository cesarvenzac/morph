/**
 * Morph any SVG into another without the spikes: icons, filled shapes, words, several shapes
 * into one or one into several. Pieces are paired by their shape, each moved whole, rounded
 * halfway and drawn as a few smooth curves, so every frame between two drawings looks drawn
 * rather than generated. Also the two usual ways, for comparing: commands paired in order
 * (most libraries), and evenly resampled points (flubber's).
 *
 *   import { morph } from "@cesarvenzac/morph";
 *   import { Plus, X } from "lucide";
 *
 *   const m = morph(Plus, X);
 *   m.at(0.5); // [{ d: "M…", width: 1 }, …]: one path per stroke, at any t from 0 to 1
 *
 *   morph(svg(heart), svg(star)); // any SVG markup, filled or stroked
 *   morph(text(font, "Hello"), text(font, "World")); // words, in a font opentype.js read
 *
 * To play one when something changes, `MorphIcon` (`@cesarvenzac/morph/react`), `mount`
 * (`@cesarvenzac/morph/dom`), or `motion` here, for any other clock.
 *
 * Plain TypeScript, no dependencies, nothing that needs a browser: draw the paths with
 * anything that draws SVG.
 */

export type { Source } from "./drawing.ts";
export { nodesData, type Node } from "./fit.ts";
export type { Icon, IconElement, Vec } from "./geometry.ts";
export {
  EVENLY,
  morph,
  SOFTLY,
  type Contour,
  type Extra,
  type Method,
  type Morph,
  type Options,
  type Part,
  type Shape,
  type Steps,
  type Stroke,
} from "./morph.ts";
export { motion, PRESS, type Motion, type MotionOptions, type Spring } from "./motion.ts";
export { attributesOf, svgOf, type Attributes, type PaintOptions, type SvgOptions } from "./paint.ts";
export { svg, type Box, type Drawing, type DrawingPart } from "./svg.ts";
export { text, type Font, type FontGlyph, type TextOptions } from "./text.ts";
