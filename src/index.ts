/**
 * Morph one stroked icon into another without the spikes: strokes paired by their shape, each
 * moved whole, rounded halfway and drawn as a few smooth curves, so every frame between two
 * icons looks drawn rather than generated. Also the two usual ways, for comparing: commands
 * paired in order (most libraries), and evenly resampled points (flubber's).
 *
 *   import { morph } from "@cesarvenzac/morph";
 *   import { Plus, X } from "lucide";
 *
 *   const m = morph(Plus, X);
 *   m.at(0.5); // [{ d: "M…", width: 1 }, …]: one path per stroke, at any t from 0 to 1
 *
 * Plain TypeScript, no dependencies, nothing that needs a browser: draw the paths with
 * anything that draws SVG.
 */

export { nodesData, type Node } from "./fit.ts";
export type { Icon, IconElement, Vec } from "./geometry.ts";
export { EVENLY, morph, SOFTLY, type Method, type Morph, type Shape, type Steps, type Stroke } from "./morph.ts";
