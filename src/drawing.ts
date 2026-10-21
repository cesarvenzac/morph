/**
 * What a morph is made of, whatever it was given. Lucide's icons, SVG markup read by `svg`, a
 * word set by `text` or a drawing made by hand all become the same pieces: a stroke, or a filled
 * island (its outline and the holes in it), each with its paint, on one frame the two sides
 * share, scaled to the 24-unit grid the morph is tuned for.
 */

import { elementPath, iconElements, inside, outline, parsePath, signedArea, subpathData, type Icon, type Subpath } from "./geometry.ts";
import { boxAround, transformSubpath, type Box, type Drawing, type Matrix } from "./svg.ts";

/** What `morph` takes: an icon (path data, a list of it, or Lucide's elements), or a drawing. */
export type Source = Icon | Drawing;

/** Whether a source is a drawing (an object with parts) rather than an icon. */
export function isDrawing(source: Source): source is Drawing {
  return typeof source === "object" && source !== null && !Array.isArray(source);
}

/** An icon as a drawing: each element a stroke `width` wide, in the current colour, on Lucide's 24-unit grid. */
export function iconDrawing(icon: Icon, width = 2): Drawing {
  return { parts: iconElements(icon).map((element) => ({ kind: "stroke" as const, d: elementPath(element), width, cap: "round" as const, join: "round" as const })), viewBox: [0, 0, 24, 24] };
}

/** A piece's paint: how wide its stroke is (in the frame's units), how filled it is (0 or 1), its colour and opacity. */
export type Paint = { width: number; fill: number; color?: string; opacity: number; cap?: "butt" | "round" | "square"; join?: "miter" | "round" | "bevel" };

/** One piece of a side: a stroke, or a filled island and its holes; its geometry on the morph's grid. */
export type Piece = {
  kind: "stroke" | "fill";
  /** A stroke's path, or an island's outer edge, on the 24-unit grid. */
  path: Subpath;
  /** An island's holes, on the grid. */
  holes: Subpath[];
  /** The piece exactly as drawn, as path data in the frame's units: what's drawn at 0 and 1. */
  exact: string;
  paint: Paint;
};

/** How two sides are laid on one frame. */
export type Layout = {
  /** The frame every moment is drawn on. */
  viewBox: Box;
  /** Where each side is put on it: nothing when it's already where it belongs. */
  place: [Matrix | null, Matrix | null];
  /** From the frame's units to the 24-unit grid the morph is tuned for. */
  scale: number;
  /** How many decimals path data is written with: enough for a thousandth of a grid unit. */
  digits: number;
};

const sameBox = (a: Box, b: Box) => a.every((value, k) => value === b[k]);

/**
 * Two drawings on one frame. Two words set at a size (`em`) are taken as they are, centred on
 * each other, the frame wide enough for both; anything else has the second fitted into the
 * first's frame, as SVG fits a viewBox (`xMidYMid meet`), and the frame is the first's.
 */
export function layoutOf(a: Drawing, b: Drawing): Layout {
  const [ax, ay, aw, ah] = a.viewBox;
  const [bx, by, bw, bh] = b.viewBox;
  let place: Matrix | null = null;
  let viewBox: Box = a.viewBox;
  let size = Math.max(aw, ah);
  if (a.em && b.em) {
    const dx = ax + aw / 2 - (bx + bw / 2);
    const dy = ay + ah / 2 - (by + bh / 2);
    if (dx || dy) place = [1, 0, 0, 1, dx, dy];
    const x0 = Math.min(ax, bx + dx);
    const y0 = Math.min(ay, by + dy);
    viewBox = [x0, y0, Math.max(ax + aw, bx + bw + dx) - x0, Math.max(ay + ah, by + bh + dy) - y0];
    size = a.em;
  } else if (!sameBox(a.viewBox, b.viewBox)) {
    const k = Math.min(aw / bw, ah / bh);
    place = [k, 0, 0, k, ax + (aw - bw * k) / 2 - bx * k, ay + (ah - bh * k) / 2 - by * k];
  }
  return { viewBox, place: [null, place], scale: 24 / size, digits: Math.max(3, Math.ceil(Math.log10(24000 / size))) };
}

/** The frame both sides of an icon morph share: the icons' own grid, as they are. */
export const ICON_LAYOUT: Layout = { viewBox: [0, 0, 24, 24], place: [null, null], scale: 1, digits: 3 };

const scaled = (path: Subpath, k: number) => (k === 1 ? path : transformSubpath(path, [k, 0, 0, k, 0, 0]));

/**
 * A drawing's pieces: each subpath of a stroked part a stroke, each island of a filled part a
 * fill, put where `place` says, then scaled by `scale` onto the grid. Exact path data stays in
 * the frame's units.
 */
export function piecesOf(drawing: Drawing, place: Matrix | null, scale: number, digits: number): Piece[] {
  const pieces: Piece[] = [];
  // A placement that scales scales strokes with it.
  const widthScale = place ? Math.sqrt(Math.abs(place[0] * place[3] - place[1] * place[2])) : 1;
  for (const part of drawing.parts) {
    let paths = parsePath(part.d);
    if (place) paths = paths.map((path) => transformSubpath(path, place));
    const paint: Paint = { width: 0, fill: 0, opacity: part.opacity ?? 1 };
    if (part.color !== undefined) paint.color = part.color;
    if (part.kind === "stroke") {
      paint.width = (part.width ?? 1) * widthScale;
      paint.cap = part.cap ?? "round";
      paint.join = part.join ?? "round";
      for (const path of paths) pieces.push({ kind: "stroke", path: scaled(path, scale), holes: [], exact: subpathData(path, digits), paint: { ...paint } });
      continue;
    }
    paint.fill = 1;
    // A fill closes every shape, written or not.
    const closed = paths.map((path): Subpath => {
      if (path.closed) return path;
      const last = path.segments[path.segments.length - 1].to;
      const back = Math.hypot(last[0] - path.start[0], last[1] - path.start[1]) > 1e-9;
      return { start: path.start, closed: true, segments: back ? [...path.segments, { kind: "line", to: path.start }] : path.segments };
    });
    const grid = closed.map((path) => scaled(path, scale));
    for (const island of islands(grid, part.rule ?? "nonzero")) {
      pieces.push({
        kind: "fill",
        path: grid[island.outer],
        holes: island.holes.map((k) => grid[k]),
        exact: [island.outer, ...island.holes].map((k) => subpathData(closed[k], digits)).join(""),
        paint: { ...paint },
      });
    }
  }
  return pieces;
}

/** At least this share of a shape's points inside another and it's taken to be inside it. */
const WITHIN = 0.75;
/** How many of a shape's points are tried. */
const PROBES = 24;

/**
 * A fill's shapes as islands: each an outer edge and the holes directly in it. Which shapes
 * are holes follows the fill rule: under `evenodd` every other shape in, under `nonzero` a
 * shape whose inside its own direction leaves unfilled. A shape inside a hole starts an island
 * of its own. Shapes that only overlap are islands of their own, drawn over each other.
 */
export function islands(paths: Subpath[], rule: "nonzero" | "evenodd"): { outer: number; holes: number[] }[] {
  const shapes = paths.map((path) => {
    const points = outline(path, 0.25).points;
    return { points, area: signedArea(points), box: boxAround(points)! };
  });
  // Largest first, so every shape's containers come before it; shapes with no area fill nothing.
  const order = shapes
    .map((_, k) => k)
    .filter((k) => Math.abs(shapes[k].area) > 1e-9)
    .sort((x, y) => Math.abs(shapes[y].area) - Math.abs(shapes[x].area));
  const parent = new Map<number, number>();
  const winding = new Map<number, number>();
  const depth = new Map<number, number>();
  order.forEach((k, at) => {
    const shape = shapes[k];
    const step = Math.max(1, Math.floor(shape.points.length / PROBES));
    const probes = shape.points.filter((_, i) => i % step === 0);
    // The smallest shape around it is the one it's directly in.
    for (let j = at - 1; j >= 0; j--) {
      const other = shapes[order[j]];
      const [x0, y0, w0, h0] = other.box;
      const [x1, y1, w1, h1] = shape.box;
      if (x1 > x0 + w0 || x1 + w1 < x0 || y1 > y0 + h0 || y1 + h1 < y0) continue;
      if (probes.filter((p) => inside(p, other.points)).length >= WITHIN * probes.length) {
        parent.set(k, order[j]);
        break;
      }
    }
    const up = parent.get(k);
    winding.set(k, (up === undefined ? 0 : winding.get(up)!) + Math.sign(shape.area));
    depth.set(k, up === undefined ? 0 : depth.get(up)! + 1);
  });
  const filled = (k: number) => (rule === "evenodd" ? depth.get(k)! % 2 === 0 : winding.get(k) !== 0);
  const found = new Map<number, { outer: number; holes: number[] }>();
  for (const k of order) {
    const up = parent.get(k);
    if (!filled(k) && up !== undefined && found.has(up)) found.get(up)!.holes.push(k);
    else found.set(k, { outer: k, holes: [] });
  }
  // In the order they were drawn.
  return [...found.values()].sort((x, y) => x.outer - y.outer).map((island) => ({ ...island, holes: island.holes.sort((x, y) => x - y) }));
}
