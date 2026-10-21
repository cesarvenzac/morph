/**
 * Three ways to morph one drawing into another, for comparing:
 *
 * - "index": what most libraries do. Each side's commands, as cubics, are paired
 *   in the order they were written, the shorter list split until the counts
 *   agree, and every control point travels in a straight line.
 * - "even": what flubber does. Outlines are resampled into evenly spaced points,
 *   matched up, turned to the starting point that's nearest, and every point
 *   travels in a straight line; the result is drawn as a polygon.
 * - "soft": this package's. The same even points, but matched to the shape
 *   (a stroke that turns is matched turning, not shrinking), each piece moved
 *   as a whole, its turn, size and place interpolated apart from its shape, and
 *   softened along its length by a blur that peaks halfway and is gone at either
 *   end, then drawn as a few fitted cubics (fit.ts) whose corners stay sharp only
 *   at the ends.
 *
 * What soft does that even doesn't is four steps (`Steps`), each of which can be
 * taken on its own, so a morph can be shown one step at a time.
 *
 * Either side is pieces (drawing.ts): strokes, and filled islands with holes in
 * them. Pieces are paired by their shape, a stroke and a fill only when nothing
 * fits better (one then crossfades into the other); an island's holes are paired
 * among themselves and move with it. Where one side has more pieces, the extra
 * ones gather into a dot or grow from one, or join a piece on the other side:
 * a stroke is cut into a stretch each, a fill into a part each (`Extra`, slice.ts).
 *
 * Every frame is also a set of nodes, anchors and their handles, as an editor
 * shows a path (`shapes`): the drawing is made from them, so the two always agree.
 *
 * At 0 and 1 every method draws both sides exactly as they are.
 */

import { mixColors } from "./color.ts";
import { ICON_LAYOUT, iconDrawing, isDrawing, layoutOf, piecesOf, type Layout, type Paint, type Piece, type Source } from "./drawing.ts";
import { chooseAnchors, nodesData, nodesThrough, type Frame, type Node } from "./fit.ts";
import { partition } from "./slice.ts";
import {
  distance,
  inside,
  nearestAlong,
  outline,
  outlineLength,
  pointsAlong,
  resample,
  runCount,
  signedArea,
  stretchOf,
  type Icon,
  type Outline,
  type Segment,
  type Subpath,
  type Vec,
} from "./geometry.ts";
import type { Box } from "./svg.ts";

export type Method = "index" | "even" | "soft";

/**
 * The steps from even to soft, each its own switch: pair points by `shape` rather
 * than by how far they travel; move each piece `whole` (its place, size and turn
 * apart from its shape) rather than point by point; `round` it, a blur along its
 * length that peaks halfway; and draw it as `curves`, fitted cubics through closer
 * points sharp only near an end's own corners, rather than a polygon, a stroke with
 * no partner shrinking away as it gathers.
 */
export type Steps = { shape: boolean; whole: boolean; round: boolean; curves: boolean };

export const EVENLY: Steps = { shape: false, whole: false, round: false, curves: false };
export const SOFTLY: Steps = { shape: true, whole: true, round: true, curves: true };

/**
 * What becomes of the pieces one side has more of. `gather`: each gathers into a dot as the
 * morph goes on, or grows from one. `split`: each joins the nearest piece of its kind on the
 * other side, so one piece splits into several, or several merge into one: a stroke is shared
 * out, a stretch each; a fill is cut into parts, one each, about as big as each; and a stroke
 * paired with a fill is parted when either has a piece of its kind to join. `auto`, the
 * default, splits only where it fits: nearby pieces that together make less than half of the
 * one they'd join, as three dots do a line; otherwise they gather.
 */
export type Extra = "auto" | "split" | "gather";

/** How to morph: the way (`soft` unless said, or some of soft's steps) and what becomes of extra pieces. */
export type Options = { way?: Method | Steps; extra?: Extra };

/**
 * One piece of a frame: its path data and how it's painted. For icons, `width` is a share of
 * the icon's stroke width (1 as drawn, narrowing to 0 as a stroke shrinks away), and nothing
 * else is said. For drawings, `width` is the stroke's width in the frame's units (0 for a fill),
 * `fill` how filled it is (0 a stroke, 1 a fill, between while one becomes the other), and
 * `color` and `opacity` its paint, left out for the current colour and fully opaque. Draw fills
 * with `fill-rule="evenodd"`: an island's holes are in its path data.
 */
export type Part = {
  d: string;
  width: number;
  fill?: number;
  color?: string;
  opacity?: number;
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
};

/** A part, by its name before drawings: one stroke of an icon. */
export type Stroke = Part;

/** One closed or open run of nodes. */
export type Contour = { nodes: Node[]; closed: boolean };

/** One piece of a frame as an editor shows it: its anchors and handles, an island's holes too. */
export type Shape = { nodes: Node[]; closed: boolean; width: number; holes?: Contour[] };

export type Morph = {
  /** How many parts every frame has (some empty, at the ends). */
  slots: number;
  /** The frame every moment is drawn on: the first side's, or both words' (24 by 24 for icons). */
  viewBox: Box;
  /** The frame at `t`, 0 the first side and 1 the second. */
  at: (t: number) => Part[];
  /** The frame at `t` as anchors and handles, what `at` draws (at 0 and 1, the method's own take on each side). */
  shapes: (t: number) => Shape[];
  /** Each part's outline points before they're drawn as curves: for measuring, and for tests. */
  points: (t: number) => Vec[][];
};

/** How far apart resampled points sit, in icon units (Lucide's grid is 24). */
const SPACING = 0.3;
/**
 * How far apart Evenly's points sit. flubber's own default (10 units) would leave a
 * bar two segments long and a circle seven on a 24-unit icon; one unit is kinder,
 * still draws curves as the polygon it is, and keeps its points apart to see.
 */
const EVEN_SPACING = 1;
/** The widest the soft blur gets, halfway: the radius corners are rounded to, in icon units. */
export const SOFTEST = 1.1;
/** Rotation's weight when matching, against shape: enough to choose the shorter turn of two equal fits. */
const TURN_WEIGHT = 0.1;
/** How far soft's fitted curves may stray from its points, in icon units: a fiftieth of a stroke's width. */
const TOLERANCE = 0.04;
/** The moments soft's anchors are chosen to fit, both ends' near neighbours included. */
const FIT_AT = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec, b: Vec, t: number): Vec => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const smoothstep = (from: number, to: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
};
const rotate = (p: Vec, angle: number): Vec => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
};

/* ----------------------------------------------------------------------------
 * Index: commands in order, control points in straight lines
 * ------------------------------------------------------------------------- */

type Cubic = { c1: Vec; c2: Vec; to: Vec };

const asCubics = (path: Subpath): Cubic[] => {
  let from = path.start;
  return path.segments.map((segment: Segment) => {
    const cubic =
      segment.kind === "cubic"
        ? { c1: segment.c1, c2: segment.c2, to: segment.to }
        : { c1: lerpVec(from, segment.to, 1 / 3), c2: lerpVec(from, segment.to, 2 / 3), to: segment.to };
    from = segment.to;
    return cubic;
  });
};

/** Splits the longest cubic in two (de Casteljau at its middle) until there are `count`. */
function split(start: Vec, cubics: Cubic[], count: number): Cubic[] {
  const list = [...cubics];
  while (list.length < count) {
    let longest = 0;
    let best = -1;
    let from = start;
    list.forEach((cubic, k) => {
      const length = distance(from, cubic.to);
      if (length >= longest) {
        longest = length;
        best = k;
      }
      from = cubic.to;
    });
    const p0 = best === 0 ? start : list[best - 1].to;
    const { c1, c2, to } = list[best];
    const a = lerpVec(p0, c1, 0.5);
    const b = lerpVec(c1, c2, 0.5);
    const c = lerpVec(c2, to, 0.5);
    const d = lerpVec(a, b, 0.5);
    const e = lerpVec(b, c, 0.5);
    const middle = lerpVec(d, e, 0.5);
    list.splice(best, 1, { c1: a, c2: d, to: middle }, { c1: e, c2: c, to });
  }
  return list;
}

/** How a morph writes its parts: on which frame, at what scale, and whether it's two icons (`plain`: width alone). */
type Settings = { layout: Layout; plain: boolean };

/** A part as drawn: path data and its paint, as much of it as the morph says. */
function painted(d: string, paint: Paint, settings: Settings): Part {
  if (settings.plain) return { d, width: paint.width };
  const part: Part = { d, width: paint.width, fill: paint.fill };
  if (paint.color !== undefined) part.color = paint.color;
  if (paint.opacity < 1) part.opacity = paint.opacity;
  if (paint.cap) part.cap = paint.cap;
  if (paint.join) part.join = paint.join;
  return part;
}

/** Contours drawn as one part. */
const partOf = (contours: Contour[], paint: Paint, settings: Settings) =>
  painted(contours.map((contour) => nodesData(contour.nodes, contour.closed, settings.layout.digits)).join(""), paint, settings);

/** The paint `t` of the way from one piece's to another's: colours mixed in OKLab, caps and joins the nearer end's. */
function paintAt(a: Paint, b: Paint, t: number, fade = 1): Paint {
  const paint: Paint = { width: lerp(a.width, b.width, t), fill: lerp(a.fill, b.fill, t), opacity: lerp(a.opacity, b.opacity, t) * fade };
  const color = mixColors(a.color, b.color, t);
  if (color !== undefined) paint.color = color;
  const near = t < 0.5 ? a : b;
  if (near.cap) paint.cap = near.cap;
  if (near.join) paint.join = near.join;
  return paint;
}

/** Nodes moved from the morph's grid back to the frame's units. */
const unscaled = (nodes: Node[], k: number): Node[] =>
  k === 1
    ? nodes
    : nodes.map((node) => {
        const back: Node = { at: [node.at[0] / k, node.at[1] / k] };
        if (node.in) back.in = [node.in[0] / k, node.in[1] / k];
        if (node.out) back.out = [node.out[0] / k, node.out[1] / k];
        return back;
      });

const unscaledPoints = (points: Vec[], k: number): Vec[] => (k === 1 ? points : points.map((p): Vec => [p[0] / k, p[1] / k]));

/** A shape from a part's contours: its outline, its holes. */
const shapeOf = ([outer, ...holes]: Contour[], width: number): Shape => (holes.length ? { ...outer, width, holes } : { ...outer, width });

function indexMorph(A: Piece[], B: Piece[], settings: Settings): Morph {
  const slots = Math.max(A.length, B.length);
  // A contour with no partner pairs with a point: its own start.
  const point = (at: Vec): Subpath => ({ start: at, segments: [{ kind: "line", to: at }], closed: false });
  const tracks = Array.from({ length: slots }, (_, k) => {
    const a = A[k];
    const b = B[k];
    const contoursA = a ? [a.path, ...a.holes] : [];
    const contoursB = b ? [b.path, ...b.holes] : [];
    const pairs = Array.from({ length: Math.max(contoursA.length, contoursB.length) }, (_, c) => {
      const from = contoursA[c] ?? point(contoursB[c].start);
      const to = contoursB[c] ?? point(contoursA[c].start);
      const count = Math.max(from.segments.length, to.segments.length);
      return { from, to, fromCubics: split(from.start, asCubics(from), count), toCubics: split(to.start, asCubics(to), count) };
    });
    const paintA = (a ?? b).paint;
    const paintB = (b ?? a).paint;
    const ends: [Part, Part] = [painted(a ? a.exact : "", paintA, settings), painted(b ? b.exact : "", paintB, settings)];
    return { pairs, paintA, paintB, ends };
  });
  const frame = (t: number) =>
    tracks.map(({ pairs, paintA, paintB }) => ({
      contours: pairs.map(({ from, to, fromCubics, toCubics }) => {
        const start = lerpVec(from.start, to.start, t);
        const cubics = fromCubics.map((cubic, k) => ({
          c1: lerpVec(cubic.c1, toCubics[k].c1, t),
          c2: lerpVec(cubic.c2, toCubics[k].c2, t),
          to: lerpVec(cubic.to, toCubics[k].to, t),
        }));
        return { start, cubics, closed: t < 0.5 ? from.closed : to.closed };
      }),
      paint: paintAt(paintA, paintB, t),
    }));
  const k = settings.layout.scale;
  const drawnAt = (t: number) =>
    frame(t).map(({ contours, paint }) => ({
      contours: contours.map(({ start, cubics, closed }) => ({ nodes: unscaled(cubicNodes(start, cubics, closed), k), closed })),
      paint,
    }));
  return {
    slots,
    viewBox: [...settings.layout.viewBox],
    at: (t) => {
      if (t <= 0) return tracks.map((track) => ({ ...track.ends[0] }));
      if (t >= 1) return tracks.map((track) => ({ ...track.ends[1] }));
      return drawnAt(t).map(({ contours, paint }) => partOf(contours, paint, settings));
    },
    shapes: (t) => drawnAt(clamp(t)).map(({ contours, paint }) => shapeOf(contours, paint.width)),
    points: (t) => frame(clamp(t)).map(({ contours: [{ start, cubics }] }) => unscaledPoints([start, ...cubics.map((c) => c.to)], k)),
  };
}

const clamp = (t: number) => Math.max(0, Math.min(1, t));

/** Cubics as nodes: each cubic's handles go to the anchors either side of it. */
function cubicNodes(start: Vec, cubics: Cubic[], closed: boolean): Node[] {
  const nodes: Node[] = [{ at: start }];
  for (const cubic of cubics) {
    nodes[nodes.length - 1].out = cubic.c1;
    nodes.push({ at: cubic.to, in: cubic.c2 });
  }
  // A closed stroke that ends where it began has one anchor there, not two.
  if (closed && nodes.length > 2 && distance(nodes[nodes.length - 1].at, start) < 1e-6) nodes[0].in = nodes.pop()!.in;
  return nodes;
}

/* ----------------------------------------------------------------------------
 * Matching outlines, and aligning their points
 * ------------------------------------------------------------------------- */

type Prepared = { path: Subpath; outline: Outline; length: number; centroid: Vec; runs: number };

function prepare(path: Subpath): Prepared {
  const o = outline(path);
  const even = resample(o, Math.max(24, runCount(o) + 2));
  return { path, outline: o, length: outlineLength(o), centroid: centroid(even.points), runs: runCount(o) };
}

const centroid = (points: Vec[]): Vec => {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
};

/** The points of `list` from `shift` on, round again (a closed stroke's points have no first). */
const rolled = <T>(list: T[], shift: number) => list.map((_, k) => list[(k + shift) % list.length]);

type Alignment = {
  /** Both strokes' points, as many each, the second's reordered to pair with the first's. */
  from: Outline;
  to: Outline;
  /** Shape, after moving, sizing and turning the second onto the first: 0 is the same shape. */
  residual: number;
  /** The turn that best lays the first onto the second, in radians. */
  turn: number;
  /** How far the points travel, squared and summed: what flubber minimises. */
  travel: number;
};

/**
 * How drawn out a set of points is: the ratio of its spread along its long axis to
 * its spread across it. A line is endless; a circle, a heart or a star is near 1.
 */
export function elongation(points: Vec[]) {
  const [cx, cy] = centroid(points);
  let a = 0;
  let b = 0;
  let c = 0;
  for (const [x, y] of points) {
    a += (x - cx) ** 2;
    b += (y - cy) ** 2;
    c += (x - cx) * (y - cy);
  }
  const middle = (a + b) / 2;
  const spread = Math.sqrt(((a - b) / 2) ** 2 + c * c);
  const small = middle - spread;
  return small < 1e-9 ? Infinity : (middle + spread) / small;
}

/** Only strokes drawn out this far, both of them, are turned: a round shape has no way it faces. */
const TURNS_FROM = 3;

/** Sizes, positions and turns removed: how far one set of points is from another in shape, and the turn between them. */
function shapeFit(p: Vec[], q: Vec[], turning: boolean) {
  const cp = centroid(p);
  const cq = centroid(q);
  let dot = 0;
  let cross = 0;
  let sp = 0;
  let sq = 0;
  for (let k = 0; k < p.length; k++) {
    const px = p[k][0] - cp[0];
    const py = p[k][1] - cp[1];
    const qx = q[k][0] - cq[0];
    const qy = q[k][1] - cq[1];
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    sp += px * px + py * py;
    sq += qx * qx + qy * qy;
  }
  // Normalised, |p̂ - R(-θ)q̂|² summed is 2 - 2·(correlation): 0 alike, up to 4 opposite.
  const scale = Math.sqrt(sp * sq);
  if (!turning) return { turn: 0, residual: scale < 1e-12 ? 0 : 2 - (2 * dot) / scale };
  const turn = Math.atan2(cross, dot);
  const residual = scale < 1e-12 ? 0 : 2 - (2 * Math.hypot(dot, cross)) / scale;
  return { turn, residual };
}

/**
 * `shapeFit` of `p` rolled by `ps` points against `q` rolled by `qs`, without building the rolled
 * lists: the same sums in the same order, so the same answer to the last digit.
 */
function shapeFitRolled(p: Vec[], ps: number, q: Vec[], qs: number, turning: boolean) {
  const n = p.length;
  let x = 0;
  let y = 0;
  for (let k = 0; k < n; k++) {
    const v = p[(k + ps) % n];
    x += v[0];
    y += v[1];
  }
  const cpx = x / n;
  const cpy = y / n;
  x = 0;
  y = 0;
  for (let k = 0; k < n; k++) {
    const v = q[(k + qs) % n];
    x += v[0];
    y += v[1];
  }
  const cqx = x / n;
  const cqy = y / n;
  let dot = 0;
  let cross = 0;
  let sp = 0;
  let sq = 0;
  for (let k = 0; k < n; k++) {
    const a = p[(k + ps) % n];
    const b = q[(k + qs) % n];
    const px = a[0] - cpx;
    const py = a[1] - cpy;
    const qx = b[0] - cqx;
    const qy = b[1] - cqy;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    sp += px * px + py * py;
    sq += qx * qx + qy * qy;
  }
  const scale = Math.sqrt(sp * sq);
  if (!turning) return { turn: 0, residual: scale < 1e-12 ? 0 : 2 - (2 * dot) / scale };
  const turn = Math.atan2(cross, dot);
  const residual = scale < 1e-12 ? 0 : 2 - (2 * Math.hypot(dot, cross)) / scale;
  return { turn, residual };
}

/** How far the points travel, squared and summed, `p` rolled by `ps` against `q` rolled by `qs`. */
function travelRolled(p: Vec[], ps: number, q: Vec[], qs: number) {
  const n = p.length;
  let travel = 0;
  for (let k = 0; k < n; k++) travel += distance(p[(k + ps) % n], q[(k + qs) % n]) ** 2;
  return travel;
}

/**
 * Lines up the points of two strokes. A closed stroke can start anywhere and run
 * either way, an open one either way; when one is closed and the other open, the
 * closed one opens where its ends will meet best. `by` picks among the ways: by
 * travel (flubber's choice) or by shape, preferring the smaller turn.
 */
function align(a: Prepared, b: Prepared, count: number, by: "travel" | "shape"): Alignment {
  const pa = resample(a.outline, count);
  const pb = resample(b.outline, count);
  const directions = [pb, { ...pb, points: [...pb.points].reverse(), corners: [...pb.corners].reverse() }];
  let best = { candidate: pb, shift: 0, turn: 0, residual: 0 };
  let bestScore = Infinity;
  // Which side turns round (the closed one; the second, if both are).
  const rollFirst = a.outline.closed && !b.outline.closed;
  // A stroke turns only if both ends of it are drawn out: a bar into a bar, not a heart into a star.
  const turning = Math.min(elongation(pa.points), elongation(pb.points)) > TURNS_FROM;
  const shifts = a.outline.closed || b.outline.closed ? count : 1;
  for (const candidate of directions) {
    for (let shift = 0; shift < shifts; shift++) {
      const [ps, qs] = rollFirst ? [shift, 0] : [0, shift];
      const fit = by === "shape" ? shapeFitRolled(pa.points, ps, candidate.points, qs, turning) : { turn: 0, residual: 0 };
      const score = by === "travel" ? travelRolled(pa.points, ps, candidate.points, qs) : fit.residual + TURN_WEIGHT * fit.turn * fit.turn;
      if (score < bestScore - 1e-12) {
        bestScore = score;
        best = { candidate, shift, ...fit };
      }
    }
  }
  const { candidate, shift } = best;
  const from = rollFirst ? { ...pa, points: rolled(pa.points, shift), corners: rolled(pa.corners, shift) } : pa;
  const to = rollFirst ? candidate : { ...candidate, points: rolled(candidate.points, shift), corners: rolled(candidate.corners, shift) };
  let travel = 0;
  for (let k = 0; k < count; k++) travel += distance(from.points[k], to.points[k]) ** 2;
  // Paired by travel, a stroke can still be moved whole: the turn that pairing implies.
  if (by === "travel") return { from, to, travel, ...shapeFit(from.points, to.points, turning) };
  return { from, to, residual: best.residual, turn: best.turn, travel };
}

/**
 * The same two strokes paired from elsewhere round the closed one (the second, if
 * both are, as `align` turns it), `fraction` of the way from the start it chose,
 * and how alike they are paired so: to show what choosing the start is for. Two
 * open strokes have no other start.
 */
function startedLater(alignment: Alignment, fraction: number): Alignment {
  let { from, to } = alignment;
  const n = to.points.length;
  const shift = Math.round(fraction * n) % n;
  if (!shift || !(from.closed || to.closed)) return alignment;
  const later = (o: Outline): Outline => ({ ...o, points: rolled(o.points, shift), corners: rolled(o.corners, shift) });
  if (to.closed) to = later(to);
  else from = later(from);
  const turning = Math.min(elongation(from.points), elongation(to.points)) > TURNS_FROM;
  let travel = 0;
  for (let k = 0; k < n; k++) travel += distance(from.points[k], to.points[k]) ** 2;
  return { from, to, travel, ...shapeFit(from.points, to.points, turning) };
}

/** Points enough for both strokes at `spacing` apart, and at least `least` (always more than their runs). */
const sampleCount = (a: Prepared, b: Prepared, spacing = SPACING, least = 24) =>
  Math.max(Math.min(240, Math.max(least, Math.round(Math.max(a.length, b.length) / spacing))), a.runs + 2, b.runs + 2);

type Pairing = { pairs: { a: number; b: number; alignment: Alignment }[]; onlyA: number[]; onlyB: number[] };

/** Above this many possible pairs, only the likeliest are lined up before choosing. */
const PRUNE_FROM = 100;
/** How many partners each is lined up with when they're pruned… */
const CANDIDATES = 4;
/** …with this many times fewer points than in full. */
const COARSER = 3;

/**
 * The cheapest way to give each row a column of its own (no more rows than columns): the
 * Hungarian method, in O(n²m).
 */
export function assign(cost: number[][]): number[] {
  const n = cost.length;
  const m = n ? cost[0].length : 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  // Which row has each column (1-based, 0 for none), and the way back along the path found.
  const owner = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let row = 1; row <= n; row++) {
    owner[0] = row;
    let column = 0;
    const least = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[column] = true;
      const r = owner[column];
      let delta = Infinity;
      let next = 0;
      for (let c = 1; c <= m; c++) {
        if (used[c]) continue;
        const reduced = cost[r - 1][c - 1] - u[r] - v[c];
        if (reduced < least[c]) {
          least[c] = reduced;
          way[c] = column;
        }
        if (least[c] < delta) {
          delta = least[c];
          next = c;
        }
      }
      for (let c = 0; c <= m; c++) {
        if (used[c]) {
          u[owner[c]] += delta;
          v[c] -= delta;
        } else least[c] -= delta;
      }
      column = next;
    } while (owner[column] !== 0);
    do {
      const previous = way[column];
      owner[column] = owner[previous];
      column = previous;
    } while (column);
  }
  const picked = new Array<number>(n).fill(-1);
  for (let c = 1; c <= m; c++) if (owner[c]) picked[owner[c] - 1] = c - 1;
  return picked;
}

/**
 * Which stroke becomes which: every stroke of the side with fewer is given a
 * partner, the pairing that costs least overall, where a pair costs the distance
 * between them, their difference in length, their difference in shape and the
 * turn between them (and `extra`, what else makes a pair unlikely), and turns that
 * disagree cost more (a plus becomes an x by turning as one). The other side's
 * spare strokes are left over.
 */
function pairStrokes(a: Prepared[], b: Prepared[], extra: (i: number, j: number) => number = () => 0): Pairing {
  const lined: (Alignment | undefined)[][] = a.map(() => b.map(() => undefined));
  const alignment = (i: number, j: number) => (lined[i][j] ??= align(a[i], b[j], sampleCount(a[i], b[j]), "shape"));
  const cost = (i: number, j: number) => {
    const fit = alignment(i, j);
    return (
      distance(a[i].centroid, b[j].centroid) +
      0.35 * Math.abs(a[i].length - b[j].length) +
      3 * fit.residual +
      1.5 * Math.abs(fit.turn) +
      (a[i].outline.closed === b[j].outline.closed ? 0 : 2) +
      extra(i, j)
    );
  };
  const fewer = a.length <= b.length ? "a" : "b";
  const small = fewer === "a" ? a.length : b.length;
  const large = fewer === "a" ? b.length : a.length;
  const pairOf = (k: number, partner: number): [number, number] => (fewer === "a" ? [k, partner] : [partner, k]);

  // Every way to give each of the fewer a different partner among the more, if there aren't too many.
  let bestPick: number[] = [];
  let bestCost = Infinity;
  const total = (pick: number[]) => {
    const turns: number[] = [];
    let sum = 0;
    pick.forEach((partner, k) => {
      const [i, j] = pairOf(k, partner);
      sum += cost(i, j);
      turns.push(alignment(i, j).turn);
    });
    const mean = turns.reduce((s, t) => s + t, 0) / (turns.length || 1);
    return sum + 2 * turns.reduce((s, t) => s + (t - mean) ** 2, 0);
  };
  let permutations = 1;
  for (let k = 0; k < small; k++) permutations *= large - k;
  if (permutations <= 5040) {
    const walk = (pick: number[]) => {
      if (pick.length === small) {
        const c = total(pick);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          bestPick = [...pick];
        }
        return;
      }
      for (let partner = 0; partner < large; partner++) if (!pick.includes(partner)) walk([...pick, partner]);
    };
    walk([]);
  } else {
    // Too many to try: the cheapest assignment. With many pieces, only the likeliest pairs are lined
    // up, and coarsely, to cost them; the pairs chosen are lined up in full after.
    const cheap = (i: number, j: number) =>
      distance(a[i].centroid, b[j].centroid) + 0.35 * Math.abs(a[i].length - b[j].length) + (a[i].outline.closed === b[j].outline.closed ? 0 : 2) + extra(i, j);
    let likely: (k: number, partner: number) => boolean = () => true;
    let estimate = cost;
    if (small * large > PRUNE_FROM) {
      const rough: (Alignment | undefined)[][] = a.map(() => b.map(() => undefined));
      estimate = (i, j) => {
        const fit = (rough[i][j] ??= align(a[i], b[j], Math.max(a[i].runs + 2, b[j].runs + 2, Math.ceil(sampleCount(a[i], b[j]) / COARSER)), "shape"));
        return cheap(i, j) + 3 * fit.residual + 1.5 * Math.abs(fit.turn);
      };
      const marked = Array.from({ length: small }, () => new Array<boolean>(large).fill(false));
      const nearest = (count: number, score: (index: number) => number) =>
        Array.from({ length: count }, (_, index) => index)
          .sort((x, y) => score(x) - score(y))
          .slice(0, CANDIDATES);
      for (let k = 0; k < small; k++) for (const partner of nearest(large, (p) => cheap(...pairOf(k, p)))) marked[k][partner] = true;
      for (let partner = 0; partner < large; partner++) for (const k of nearest(small, (q) => cheap(...pairOf(q, partner)))) marked[k][partner] = true;
      likely = (k, partner) => marked[k][partner];
    }
    bestPick = assign(
      Array.from({ length: small }, (_, k) =>
        Array.from({ length: large }, (_, partner) => (likely(k, partner) ? estimate(...pairOf(k, partner)) : cheap(...pairOf(k, partner)) + 1000)),
      ),
    );
  }

  const pairs = bestPick.map((partner, k) => {
    const [i, j] = pairOf(k, partner);
    return { a: i, b: j, alignment: alignment(i, j) };
  });
  const usedA = new Set(pairs.map((pair) => pair.a));
  const usedB = new Set(pairs.map((pair) => pair.b));
  return {
    pairs,
    onlyA: a.map((_, i) => i).filter((i) => !usedA.has(i)),
    onlyB: b.map((_, j) => j).filter((j) => !usedB.has(j)),
  };
}

/* ----------------------------------------------------------------------------
 * Pieces: strokes and islands, ready to pair
 * ------------------------------------------------------------------------- */

/** A piece with its outline and holes laid out, how big it is (a stroke's length, a fill's area), and how far it reaches across. */
type Ready = { kind: "stroke" | "fill"; outer: Prepared; holes: Prepared[]; exact: string; paint: Paint; size: number; extent: number };

function ready(piece: Piece): Ready {
  const outer = prepare(piece.path);
  const holes = piece.holes.map(prepare);
  const area = (p: Prepared) => Math.abs(signedArea(p.outline.points));
  const size = piece.kind === "stroke" ? outer.length : Math.max(0, area(outer) - holes.reduce((sum, hole) => sum + area(hole), 0));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of outer.outline.points) {
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  return { kind: piece.kind, outer, holes, exact: piece.exact, paint: piece.paint, size, extent: Math.max(x1 - x0, y1 - y0) };
}

/** What a stroke paired with a fill costs on top of the rest: they pair only when nothing fits better. */
const KIND_COST = 4;

const pairPieces = (A: Ready[], B: Ready[]) =>
  pairStrokes(
    A.map((piece) => piece.outer),
    B.map((piece) => piece.outer),
    (i, j) => (A[i].kind === B[j].kind ? 0 : KIND_COST),
  );

/** How far a point is from a piece: from its outline, or nothing if it's inside a fill. */
function distanceTo(piece: Ready, p: Vec) {
  const { points, closed } = piece.outer.outline;
  if (piece.kind === "fill" && inside(p, points)) return 0;
  if (points.length === 1) return distance(p, points[0]);
  let nearest = Infinity;
  for (let k = 0; k < (closed ? points.length : points.length - 1); k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    const span = distance(a, b) ** 2;
    const u = span < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / span));
    nearest = Math.min(nearest, distance(p, lerpVec(a, b, u)));
  }
  return nearest;
}

/** With `auto`, pieces join one only if each, its partner too, reaches less than this share as far across… */
const JOIN_SMALL = 0.5;
/** …each is within this many grid units of it… */
const JOIN_NEAR = 3;
/** …and, joining a stroke, they travel no more than this to the stretches of it they become (on average). */
const JOIN_TRAVEL = 2.5;

/** A pair's piece and the extra ones that join it, which side they're on, and the part of it each becomes: a stretch of a stroke, a part of a fill. */
type Group = { joined: number[]; onA: boolean; cuts?: Subpath[] };

/**
 * Which of the extra pieces join a pair (by its index) and which are left to gather. Each looks
 * to the nearest piece of its kind on the other side. With `split` it always joins it, and a
 * stroke paired with a fill (which could only crossfade) is parted when either has a piece of its
 * kind to join instead: letters becoming a sun merge into its disc while its rays grow. With
 * `auto` the pieces near one join it together, or none do: only small pieces (dots, dashes,
 * rays) joining one much bigger whose partner is small too, and for a stroke, lying along it
 * (three dots becoming a line, the rays of a loader a circle).
 */
function joinExtras(pairing: Pairing, A: Ready[], B: Ready[], extra: Extra) {
  const groups = new Map<number, Group>();
  if (extra === "gather") return { pairs: pairing.pairs, groups, spareA: pairing.onlyA, spareB: pairing.onlyB };
  let { pairs } = pairing;
  const onlyA = [...pairing.onlyA];
  const onlyB = [...pairing.onlyB];
  if (extra === "split") {
    const alike = pairs.filter((pair) => A[pair.a].kind === B[pair.b].kind);
    const hosted = (kind: Ready["kind"], onB: boolean) => alike.some((pair) => (onB ? B[pair.b] : A[pair.a]).kind === kind);
    const kept: Pairing["pairs"] = [];
    for (const pair of pairs) {
      if (A[pair.a].kind !== B[pair.b].kind && (hosted(A[pair.a].kind, true) || hosted(B[pair.b].kind, false))) {
        onlyA.push(pair.a);
        onlyB.push(pair.b);
      } else kept.push(pair);
    }
    pairs = kept;
  }
  const spareA: number[] = [];
  const spareB: number[] = [];
  // Each side's extras look to the other side; a pair joined from one side can't be from the other.
  for (const onA of [true, false]) {
    const many = onA ? A : B;
    const one = onA ? B : A;
    const partner = (p: number) => one[onA ? pairs[p].b : pairs[p].a];
    const own = (p: number) => many[onA ? pairs[p].a : pairs[p].b];
    const spares = onA ? spareA : spareB;
    const joining = new Map<number, number[]>();
    for (const k of onA ? onlyA : onlyB) {
      let p = -1;
      let near = Infinity;
      pairs.forEach((_, q) => {
        if (partner(q).kind !== many[k].kind || groups.has(q)) return;
        const d = distanceTo(partner(q), many[k].outer.centroid);
        if (d < near) {
          near = d;
          p = q;
        }
      });
      if (p < 0 || (extra === "auto" && near > JOIN_NEAR)) spares.push(k);
      else joining.set(p, [...(joining.get(p) ?? []), k]);
    }
    for (const [p, joined] of joining) {
      const big = partner(p);
      const smalls = [own(p), ...joined.map((k) => many[k])];
      let joins = extra === "split" || smalls.every((small) => small.extent < JOIN_SMALL * big.extent);
      let cuts: Subpath[] | undefined;
      if (joins && big.kind === "stroke") {
        const cut = cutsFor(
          big.outer,
          smalls.map((small) => small.outer),
          smalls.map((small) => small.size),
        );
        cuts = cut.cuts;
        joins = extra === "split" || cut.travel <= JOIN_TRAVEL;
      } else if (joins) cuts = slicesFor(big, smalls) ?? undefined;
      if (joins) groups.set(p, { joined, onA, cuts });
      else spares.push(...joined);
    }
    spares.sort((x, y) => x - y);
  }
  return { pairs, groups, spareA, spareB };
}

/** Every order of `count` things, for a few. */
function orders(count: number): number[][] {
  if (count <= 1) return [Array.from({ length: count }, (_, k) => k)];
  return orders(count - 1).flatMap((order) => Array.from({ length: count }, (_, at) => [...order.slice(0, at), count - 1, ...order.slice(at)]));
}

/** Up to this many pieces sharing out a stroke, every order they could take along it is tried. */
const ORDERS_UP_TO = 6;
/** How finely the stroke is measured for it, and how many turns of a closed one are tried. */
const CUT_SAMPLES = 240;
const CUT_TURNS = 48;

/**
 * A stroke shared out between pieces: cut into one stretch each, as long as its piece's share
 * (its size and half the average, so dots share evenly), in the order along it, and for a closed
 * one at the turn, where the pieces travel least to their stretches; and how far that is, on
 * average (the root of the mean square).
 */
function cutsFor(big: Prepared, smalls: Prepared[], sizes: number[]): { cuts: Subpath[]; travel: number } {
  const o = big.outline;
  const total = big.length;
  const mean = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  const weights = sizes.map((size) => size + 0.5 * mean + 1e-9);
  const sum = weights.reduce((s, w) => s + w, 0);
  // Where a stretch's middle is, from even samples along the stroke and their running sums.
  const samples = pointsAlong(o, CUT_SAMPLES);
  const sx = [0];
  const sy = [0];
  for (const [x, y] of samples) {
    sx.push(sx[sx.length - 1] + x);
    sy.push(sy[sy.length - 1] + y);
  }
  const middleOf = (from: number, to: number): Vec => {
    const step = total / CUT_SAMPLES;
    let first = Math.ceil(from / step - 0.5);
    let last = Math.floor(to / step - 0.5);
    if (last < first) first = last = Math.round((from + to) / 2 / step - 0.5);
    // The samples from first to last: round past the end of a closed stroke, cut at the ends of an open one.
    const ranges: [number, number][] = [];
    if (o.closed) {
      const start = ((first % CUT_SAMPLES) + CUT_SAMPLES) % CUT_SAMPLES;
      const end = start + Math.min(CUT_SAMPLES - 1, last - first);
      ranges.push(end < CUT_SAMPLES ? [start, end] : [start, CUT_SAMPLES - 1], ...(end < CUT_SAMPLES ? [] : ([[0, end - CUT_SAMPLES]] as [number, number][])));
    } else {
      const start = Math.max(0, Math.min(CUT_SAMPLES - 1, first));
      ranges.push([start, Math.max(start, Math.min(CUT_SAMPLES - 1, last))]);
    }
    let [x, y, count] = [0, 0, 0];
    for (const [a, b] of ranges) {
      x += sx[b + 1] - sx[a];
      y += sy[b + 1] - sy[a];
      count += b - a + 1;
    }
    return [x / count, y / count];
  };
  const along = smalls.length <= ORDERS_UP_TO ? [] : smalls.map((small) => nearestAlong(o, small.centroid));
  const candidates = smalls.length <= ORDERS_UP_TO ? orders(smalls.length) : [smalls.map((_, k) => k).sort((x, y) => along[x] - along[y])];
  const turns = o.closed && total > 0 ? Array.from({ length: CUT_TURNS }, (_, k) => (k * total) / CUT_TURNS) : [0];
  let best = { cost: Infinity, order: candidates[0], offset: 0 };
  for (const order of candidates) {
    const lengths = order.map((k) => (weights[k] / sum) * total);
    for (const offset of turns) {
      let cost = 0;
      let at = offset;
      order.forEach((k, j) => {
        cost += distance(middleOf(at, at + lengths[j]), smalls[k].centroid) ** 2;
        at += lengths[j];
      });
      if (cost < best.cost - 1e-9) best = { cost, order, offset };
    }
  }
  const cuts: Subpath[] = new Array(smalls.length);
  let at = best.offset;
  for (const k of best.order) {
    const length = (weights[k] / sum) * total;
    cuts[k] = stretchOf(o, at, at + length);
    at += length;
  }
  return { cuts, travel: Math.sqrt(best.cost / smalls.length) };
}

/** How far each part of a fill cut into parts reaches past its neighbours, in grid units: no seam shows between them. */
const SEAM = 0.05;

/**
 * A fill shared out between pieces: cut into a part each (`partition`), where each piece lies
 * laid onto it (their bounding box fitted into its, the same scale both ways), each part about
 * its piece's share of the fill. Null for a fill with holes, or one that won't cut cleanly: then
 * each piece becomes the whole of it.
 */
function slicesFor(big: Ready, smalls: Ready[]): Subpath[] | null {
  if (big.holes.length) return null;
  const polygon = big.outer.outline.points;
  const boxOf = (lists: Vec[][]) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const points of lists) {
      for (const [x, y] of points) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    return [x0, y0, x1, y1];
  };
  const [X0, Y0, X1, Y1] = boxOf([polygon]);
  const [x0, y0, x1, y1] = boxOf(smalls.map((small) => small.outer.outline.points));
  const k = Math.min((X1 - X0) / Math.max(x1 - x0, 1e-9), (Y1 - Y0) / Math.max(y1 - y0, 1e-9));
  const sites = smalls.map(({ outer }): Vec => [(X0 + X1) / 2 + k * (outer.centroid[0] - (x0 + x1) / 2), (Y0 + Y1) / 2 + k * (outer.centroid[1] - (y0 + y1) / 2)]);
  const total = smalls.reduce((sum, small) => sum + small.size, 0);
  const parts = partition(
    polygon,
    sites,
    smalls.map((small) => (total > 0 ? small.size / total : 1 / smalls.length)),
    SEAM,
  );
  // Closed as path data closes, with a line back to the start.
  return parts && parts.map(([start, ...rest]) => ({ start, segments: [...rest, start].map((to) => ({ kind: "line" as const, to })), closed: true }));
}

/* ----------------------------------------------------------------------------
 * Even and soft
 * ------------------------------------------------------------------------- */

/** A stroke's points blurred along its length (a Gaussian, `sigma` icon units wide); an open stroke keeps its ends. */
export function soften(points: Vec[], closed: boolean, sigma: number): Vec[] {
  const n = points.length;
  if (n < 3 || sigma <= 1e-6) return points;
  let length = 0;
  for (let k = 1; k < n; k++) length += distance(points[k - 1], points[k]);
  if (closed) length += distance(points[n - 1], points[0]);
  const spacing = length / (closed ? n : n - 1) || 1;
  const reach = Math.min(Math.ceil((3 * sigma) / spacing), closed ? Math.floor(n / 2) : n - 1);
  if (reach < 1) return points;
  const weights = Array.from({ length: reach + 1 }, (_, j) => Math.exp(-((j * spacing) ** 2) / (2 * sigma * sigma)));
  // Beyond an open stroke's end, its points mirrored through the end: straight lines stay straight, ends stay put.
  const at = (k: number): Vec => {
    if (closed) return points[((k % n) + n) % n];
    if (k < 0) return [2 * points[0][0] - points[-k][0], 2 * points[0][1] - points[-k][1]];
    if (k >= n) return [2 * points[n - 1][0] - points[2 * (n - 1) - k][0], 2 * points[n - 1][1] - points[2 * (n - 1) - k][1]];
    return points[k];
  };
  return points.map((_, k) => {
    let x = 0;
    let y = 0;
    let sum = 0;
    for (let j = -reach; j <= reach; j++) {
      const w = weights[Math.abs(j)];
      const p = at(k + j);
      x += w * p[0];
      y += w * p[1];
      sum += w;
    }
    return [x / sum, y / sum];
  });
}

/**
 * The second shape's points in the first's frame, and what it takes to get
 * there: where each sits, how big it is, and the turn between them.
 */
function rigidParts(from: Vec[], to: Vec[], turn: number) {
  const cf = centroid(from);
  const ct = centroid(to);
  const rms = (points: Vec[], c: Vec) => Math.sqrt(points.reduce((s, p) => s + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, 0) / points.length);
  const sf = rms(from, cf);
  const st = rms(to, ct);
  const shapeFrom = from.map((p): Vec => (sf < 1e-9 ? [0, 0] : [(p[0] - cf[0]) / sf, (p[1] - cf[1]) / sf]));
  const shapeTo = to.map((p): Vec => {
    if (st < 1e-9) return [0, 0];
    return rotate([(p[0] - ct[0]) / st, (p[1] - ct[1]) / st], -turn);
  });
  return { cf, ct, sf, st, shapeFrom, shapeTo };
}



/** A contour at one moment, on the grid: its points, how smooth each is, whether it closes, and its anchors. */
type Moment = Frame & { closed: boolean; anchors: number[] };

/** One slot of a morph: what it draws at either end, and its contours and paint between. */
type Track = { ends: [Part, Part]; at: (t: number) => { contours: Moment[]; paint: Paint } };

/** An island's own frame at either end, and how it moves between: its holes move in it, and with it. */
type Island = { fromFrame: (p: Vec) => Vec; toFrame: (p: Vec) => Vec; at: (t: number) => (p: Vec) => Vec };

function islandOf(alignment: Alignment): Island {
  const { cf, ct, sf, st } = rigidParts(alignment.from.points, alignment.to.points, alignment.turn);
  const turn = alignment.turn;
  return {
    fromFrame: (p) => (sf < 1e-9 ? [0, 0] : [(p[0] - cf[0]) / sf, (p[1] - cf[1]) / sf]),
    toFrame: (q) => (st < 1e-9 ? [0, 0] : rotate([(q[0] - ct[0]) / st, (q[1] - ct[1]) / st], -turn)),
    at: (t) => {
      const size = sf > 1e-9 && st > 1e-9 ? Math.exp(lerp(Math.log(sf), Math.log(st), t)) : lerp(sf, st, t);
      const centre = lerpVec(cf, ct, t);
      const angle = turn * t;
      return (p) => {
        const [x, y] = rotate(p, angle);
        return [centre[0] + size * x, centre[1] + size * y];
      };
    },
  };
}

/**
 * Even, soft, or any of the steps between (`Steps`). `startAt` pairs each closed
 * stroke from that far round from the start it would pick (`startedLater`).
 */
function steppedMorph(A: Ready[], B: Ready[], steps: Steps, settings: Settings, extra: Extra = "auto", startAt = 0): Morph & { residual: number } {
  const pairing = pairPieces(A, B);
  // Curves are drawn through closer points than a polygon's.
  const spacing = steps.curves ? SPACING : EVEN_SPACING;
  const least = steps.curves ? 24 : 2;
  /** Two outlines' points lined up: soft keeps the alignment they were paired with; flubber pairs points by how far they travel. */
  const lineUp = (from: Prepared, to: Prepared, paired?: Alignment) =>
    steps.shape && steps.curves && paired ? paired : align(from, to, sampleCount(from, to, spacing, least), steps.shape ? "shape" : "travel");
  // As densely as paired outlines, or a spare one's rounded corners would gather into kinks.
  const lone = (p: Prepared) => resample(p.outline, Math.max(Math.min(240, Math.max(least, Math.round(p.length / spacing))), p.runs + 2));
  const exact = (piece: Ready) => painted(piece.exact, piece.paint, settings);
  const empty = (paint: Paint) => painted("", paint, settings);

  /** One outline becoming another, by itself or inside its island, and smooth at each point but an end's own corners near that end. */
  const contour = (alignment: Alignment, island?: Island) => {
    const { from, to } = alignment;
    // A stroke closes only once it's the closed one, and if both are.
    const closed = from.closed && to.closed;
    const fromPoints = island ? from.points.map(island.fromFrame) : from.points;
    const toPoints = island ? to.points.map(island.toFrame) : to.points;
    const turn = island ? shapeFit(fromPoints, toPoints, Math.min(elongation(fromPoints), elongation(toPoints)) > TURNS_FROM).turn : alignment.turn;
    const { cf, ct, sf, st, shapeFrom, shapeTo } = rigidParts(fromPoints, toPoints, turn);
    const at = (t: number): Frame & { closed: boolean } => {
      const ease = (i: number) => 1 - Math.max(from.corners[i] ? (1 - t) ** 3 : 0, to.corners[i] ? t ** 3 : 0);
      const softened = (points: Vec[]) => (steps.round ? soften(points, closed, SOFTEST * Math.sin(Math.PI * t)) : points);
      let points: Vec[];
      if (!steps.whole) points = fromPoints.map((p, i) => lerpVec(p, toPoints[i], t));
      else {
        const size = sf > 1e-9 && st > 1e-9 ? Math.exp(lerp(Math.log(sf), Math.log(st), t)) : lerp(sf, st, t);
        const centre = lerpVec(cf, ct, t);
        const angle = turn * t;
        points = shapeFrom.map((p, i) => {
          const [x, y] = rotate(lerpVec(p, shapeTo[i], t), angle);
          return [centre[0] + size * x, centre[1] + size * y] as Vec;
        });
      }
      if (island) {
        const place = island.at(t);
        points = points.map(place);
      }
      return { points: softened(points), closed, ease };
    };
    // Soft's anchors, once for the whole morph: every corner either end has, then as few as fit every frame.
    const forced = from.corners.map((corner, i) => corner || to.corners[i]);
    const anchors = steps.curves ? chooseAnchors(FIT_AT.map(at), closed, forced, TOLERANCE) : [];
    return { at: (t: number): Moment => ({ ...at(t), anchors }) };
  };

  /**
   * An outline gathering into a point as `t` goes on (or growing from it): its own centre, or
   * `centre`; inside its island's frame when it's a hole of an island that moves. Its shape is
   * the same at every size, so its anchors fit it as it is.
   */
  const gathering = (o: Outline, vanishing: boolean, island?: { frame: (p: Vec) => Vec; at: Island["at"] }, centre?: Vec) => {
    const ease = (i: number) => (o.corners[i] ? 0 : 1);
    const anchors = steps.curves ? chooseAnchors([{ points: o.points, ease }], o.closed, o.corners, TOLERANCE) : [];
    const points = island ? o.points.map(island.frame) : o.points;
    const middle = centre ?? centroid(points);
    return {
      at: (t: number): Moment => {
        const amount = vanishing ? t : 1 - t;
        const pull = steps.curves ? smoothstep(0, 0.75, amount) : amount;
        let moved = points.map((p) => lerpVec(p, middle, pull));
        if (island) {
          const place = island.at(t);
          moved = moved.map(place);
        }
        return { points: moved, ease, closed: o.closed, anchors };
      },
    };
  };

  /** One piece becoming another: outline to outline, holes to holes (in the island's frame), paint to paint. */
  const pairTrack = (from: Ready, to: Ready, alignment: Alignment, ends: [Part, Part], fade?: (t: number) => number): Track => {
    const outer = contour(alignment);
    const holes: { at: (t: number) => Moment }[] = [];
    if (from.holes.length || to.holes.length) {
      const island = steps.whole ? islandOf(alignment) : undefined;
      const paired = pairStrokes(from.holes, to.holes);
      for (const pair of paired.pairs) holes.push(contour(lineUp(from.holes[pair.a], to.holes[pair.b], pair.alignment), island));
      for (const i of paired.onlyA) holes.push(gathering(lone(from.holes[i]), true, island && { frame: island.fromFrame, at: island.at }));
      for (const j of paired.onlyB) holes.push(gathering(lone(to.holes[j]), false, island && { frame: island.toFrame, at: island.at }));
    }
    return {
      ends,
      at: (t) => ({ contours: [outer.at(t), ...holes.map((hole) => hole.at(t))], paint: paintAt(from.paint, to.paint, t, fade ? fade(t) : 1) }),
    };
  };

  /** A piece with no partner: gathering into a dot, its holes with it; drawn as curves, a stroke's dot also shrinks away. */
  const spareTrack = (piece: Ready, vanishing: boolean): Track => {
    const outer = lone(piece.outer);
    const centre = centroid(outer.points);
    const contours = [gathering(outer, vanishing, undefined, centre), ...piece.holes.map((hole) => gathering(lone(hole), vanishing, undefined, centre))];
    return {
      ends: vanishing ? [exact(piece), empty(piece.paint)] : [empty(piece.paint), exact(piece)],
      at: (t) => {
        const amount = vanishing ? t : 1 - t;
        const width = piece.paint.width * (steps.curves ? 1 - smoothstep(0.4, 1, amount) : 1);
        return { contours: contours.map((c) => c.at(t)), paint: { ...piece.paint, width } };
      },
    };
  };

  /**
   * One piece and the several on the other side it becomes, or that become it: a stroke shared
   * out between them, a stretch each, or a fill cut into parts, one each; without cuts (a fill
   * with holes), each becomes the whole of it, the copies beyond the first fading as they land
   * on it. At its own end the one piece is drawn once, exactly.
   */
  const groupTracks = (big: Ready, smalls: Ready[], bigOnB: boolean, paired: Alignment, cuts?: Subpath[]): Track[] => {
    const bigEnd = (k: number) => (k === 0 ? exact(big) : empty(big.paint));
    const endsFor = (small: Ready, k: number): [Part, Part] => (bigOnB ? [exact(small), bigEnd(k)] : [bigEnd(k), exact(small)]);
    if (cuts) {
      return smalls.map((small, k) => {
        const piece: Ready = { ...big, outer: prepare(cuts[k]), holes: [] };
        const [from, to] = bigOnB ? [small, piece] : [piece, small];
        return pairTrack(from, to, lineUp(from.outer, to.outer), endsFor(small, k));
      });
    }
    return smalls.map((small, k) => {
      const [from, to] = bigOnB ? [small, big] : [big, small];
      const fade = k === 0 ? undefined : (t: number) => 1 - smoothstep(0.6, 1, bigOnB ? t : 1 - t);
      return pairTrack(from, to, lineUp(from.outer, to.outer, k === 0 ? paired : undefined), endsFor(small, k), fade);
    });
  };

  const { pairs, groups, spareA, spareB } = joinExtras(pairing, A, B, extra);
  const tracks: Track[] = [];
  const joiners: Track[] = [];
  let residual = 0;
  pairs.forEach((pair, p) => {
    const group = groups.get(p);
    if (!group) {
      const lined = lineUp(A[pair.a].outer, B[pair.b].outer, pair.alignment);
      const alignment = startAt ? startedLater(lined, startAt) : lined;
      residual += alignment.residual;
      tracks.push(pairTrack(A[pair.a], B[pair.b], alignment, [exact(A[pair.a]), exact(B[pair.b])]));
      return;
    }
    residual += pair.alignment.residual;
    const [first, ...rest] = group.onA
      ? groupTracks(B[pair.b], [pair.a, ...group.joined].map((i) => A[i]), true, pair.alignment, group.cuts)
      : groupTracks(A[pair.a], [pair.b, ...group.joined].map((j) => B[j]), false, pair.alignment, group.cuts);
    tracks.push(first);
    joiners.push(...rest);
  });
  tracks.push(...joiners, ...spareA.map((i) => spareTrack(A[i], true)), ...spareB.map((j) => spareTrack(B[j], false)));

  const k = settings.layout.scale;
  const drawnAt = (t: number) =>
    tracks.map((track) => {
      const { contours, paint } = track.at(t);
      return {
        contours: contours.map((c) => ({ nodes: unscaled(steps.curves ? nodesThrough(c, c.closed, c.anchors) : c.points.map((at) => ({ at })), k), closed: c.closed })),
        paint,
      };
    });

  return {
    slots: tracks.length,
    viewBox: [...settings.layout.viewBox],
    at: (t) => {
      if (t <= 0) return tracks.map((track) => ({ ...track.ends[0] }));
      if (t >= 1) return tracks.map((track) => ({ ...track.ends[1] }));
      return drawnAt(t).map(({ contours, paint }) => partOf(contours, paint, settings));
    },
    shapes: (t) => drawnAt(clamp(t)).map(({ contours, paint }) => shapeOf(contours, paint.width)),
    points: (t) => tracks.map((track) => unscaledPoints(track.at(Math.max(1e-6, Math.min(1 - 1e-6, t))).contours[0].points, k)),
    residual,
  };
}

const isSteps = (value: object): value is Steps => "shape" in value || "whole" in value || "round" in value || "curves" in value;

/** The pieces of an icon, as an icon morph takes them: strokes as wide as the icon's own. */
const iconPieces = (icon: Icon) => piecesOf(iconDrawing(icon, 1), null, 1, 3);

const PLAIN: Settings = { layout: ICON_LAYOUT, plain: true };

/**
 * A morph from one icon or drawing to another: soft by default, or one of the other two ways,
 * or even with some of soft's steps, and with `extra` saying what becomes of pieces one side
 * has more of. Built once (the matching is the costly part), then drawn at any `t`.
 *
 * Two icons are drawn on their 24-unit grid, each part's `width` a share of their stroke
 * width. Anything else is drawn on the first side's frame (`viewBox`), the second fitted into
 * it, or two words centred on each other; an icon among drawings is stroked 2 wide, as Lucide
 * draws it.
 */
export function morph(from: Source, to: Source, options: Method | Steps | Options = "soft"): Morph {
  const { way = "soft", extra = "auto" }: Options = typeof options === "string" || isSteps(options) ? { way: options } : options;
  const steps = way === "index" ? null : way === "even" ? EVENLY : way === "soft" ? SOFTLY : way;
  if (!isDrawing(from) && !isDrawing(to)) {
    const [A, B] = [iconPieces(from), iconPieces(to)];
    return steps ? steppedMorph(A.map(ready), B.map(ready), steps, PLAIN, extra) : indexMorph(A, B, PLAIN);
  }
  const a = isDrawing(from) ? from : iconDrawing(from);
  const b = isDrawing(to) ? to : iconDrawing(to);
  const settings: Settings = { layout: layoutOf(a, b), plain: false };
  const { place, scale, digits } = settings.layout;
  const A = piecesOf(a, place[0], scale, digits);
  const B = piecesOf(b, place[1], scale, digits);
  return steps ? steppedMorph(A.map(ready), B.map(ready), steps, settings, extra) : indexMorph(A, B, settings);
}

/**
 * One source drawn as it is, at every `t`: what a morph between it and itself shows, without
 * pairing anything (a motion at rest, motion.ts).
 */
export function stillOf(source: Source): Morph {
  const plain = !isDrawing(source);
  const drawing = isDrawing(source) ? source : iconDrawing(source, 1);
  const settings: Settings = plain ? PLAIN : { layout: layoutOf(drawing, drawing), plain: false };
  const { scale, digits } = settings.layout;
  const pieces = piecesOf(drawing, null, scale, digits);
  const parts = pieces.map((piece) => painted(piece.exact, piece.paint, settings));
  const k = scale;
  const contourOf = (path: Subpath): Contour => ({ nodes: unscaled(cubicNodes(path.start, asCubics(path), path.closed), k), closed: path.closed });
  return {
    slots: parts.length,
    viewBox: [...settings.layout.viewBox],
    at: () => parts.map((part) => ({ ...part })),
    shapes: () => pieces.map((piece) => shapeOf([contourOf(piece.path), ...piece.holes.map(contourOf)], piece.paint.width)),
    points: () => pieces.map((piece) => unscaledPoints(outline(piece.path).points, k)),
  };
}

/**
 * Soft's morph with each closed stroke started `fraction` of the way round from
 * the start it picks (0 is soft's own), and how unlike the paired shapes are: 0
 * the same shape, up to 4 opposite. What trying every start is for.
 */
export function startedAt(from: Icon, to: Icon, fraction: number) {
  const m = steppedMorph(iconPieces(from).map(ready), iconPieces(to).map(ready), SOFTLY, PLAIN, "auto", fraction);
  return { morph: m as Morph, residual: m.residual };
}

/** The sharpest turn along a stroke's points, in radians: how spiky a frame is. */
export function sharpestTurn(points: Vec[], closed: boolean) {
  let sharpest = 0;
  const n = points.length;
  for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) {
    const before = points[(k - 1 + n) % n];
    const p = points[k];
    const after = points[(k + 1) % n];
    const ax = p[0] - before[0];
    const ay = p[1] - before[1];
    const bx = after[0] - p[0];
    const by = after[1] - p[1];
    const length = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (length < 1e-12) continue;
    sharpest = Math.max(sharpest, Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / length))));
  }
  return sharpest;
}
