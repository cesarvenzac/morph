/**
 * Three ways to morph one icon's strokes into another's, for comparing:
 *
 * - "index": what most libraries do. Each icon's commands, as cubics, are paired
 *   in the order they were written, the shorter list split until the counts
 *   agree, and every control point travels in a straight line.
 * - "even": what flubber does. Strokes are resampled into evenly spaced points,
 *   matched up, turned to the starting point that's nearest, and every point
 *   travels in a straight line; the result is drawn as a polygon.
 * - "soft": this experiment's. The same even points, but matched to the shape
 *   (a stroke that turns is matched turning, not shrinking), each stroke moved
 *   as a whole, its turn, size and place interpolated apart from its shape, and
 *   softened along its length by a blur that peaks halfway and is gone at either
 *   end, then drawn as a few fitted cubics (fit.ts) whose corners stay sharp only
 *   at the ends.
 *
 * What soft does that even doesn't is four steps (`Steps`), each of which can be
 * taken on its own, so a morph can be shown one step at a time.
 *
 * Every frame is also a set of nodes, anchors and their handles, as an editor
 * shows a path (`shapes`): the drawing is made from them, so the two always agree.
 *
 * Strokes one icon has and the other doesn't shrink to a dot or grow from one.
 * At 0 and 1 every method draws the icons exactly as they are.
 */

import { chooseAnchors, nodesData, nodesThrough, type Frame, type Node } from "./fit.ts";
import {
  distance,
  iconSubpaths,
  outline,
  outlineLength,
  resample,
  runCount,
  subpathData,
  type Icon,
  type Outline,
  type Segment,
  type Subpath,
  type Vec,
} from "./geometry.ts";

export type Method = "index" | "even" | "soft";

/**
 * The steps from even to soft, each its own switch: pair points by `shape` rather
 * than by how far they travel; move each stroke `whole` (its place, size and turn
 * apart from its shape) rather than point by point; `round` it, a blur along its
 * length that peaks halfway; and draw it as `curves`, fitted cubics through closer
 * points sharp only near an end's own corners, rather than a polygon, a stroke with
 * no partner shrinking away as it gathers.
 */
export type Steps = { shape: boolean; whole: boolean; round: boolean; curves: boolean };

export const EVENLY: Steps = { shape: false, whole: false, round: false, curves: false };
export const SOFTLY: Steps = { shape: true, whole: true, round: true, curves: true };

/** One stroke of a frame: its path data, and its width as a share of the icon's. */
export type Stroke = { d: string; width: number };

/** One stroke of a frame as an editor shows it: its anchors and handles. */
export type Shape = { nodes: Node[]; closed: boolean; width: number };

export type Morph = {
  /** How many strokes every frame has (some empty, at the ends). */
  slots: number;
  /** The frame at `t`, 0 the first icon and 1 the second. */
  at: (t: number) => Stroke[];
  /** The frame at `t` as anchors and handles, what `at` draws (at 0 and 1, the method's own take on each icon). */
  shapes: (t: number) => Shape[];
  /** The frame's points before they're drawn as curves: for measuring, and for tests. */
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

function indexMorph(a: Subpath[], b: Subpath[]): Morph {
  const slots = Math.max(a.length, b.length);
  // A stroke with no partner pairs with a point: its own start.
  const point = (at: Vec): Subpath => ({ start: at, segments: [{ kind: "line", to: at }], closed: false });
  const pairs = Array.from({ length: slots }, (_, k) => {
    const from = a[k] ?? point(b[k].start);
    const to = b[k] ?? point(a[k].start);
    const count = Math.max(from.segments.length, to.segments.length);
    return { from, to, fromCubics: split(from.start, asCubics(from), count), toCubics: split(to.start, asCubics(to), count) };
  });
  const frame = (t: number) =>
    pairs.map(({ from, to, fromCubics, toCubics }) => {
      const start = lerpVec(from.start, to.start, t);
      const cubics = fromCubics.map((cubic, k) => ({
        c1: lerpVec(cubic.c1, toCubics[k].c1, t),
        c2: lerpVec(cubic.c2, toCubics[k].c2, t),
        to: lerpVec(cubic.to, toCubics[k].to, t),
      }));
      return { start, cubics, closed: t < 0.5 ? from.closed : to.closed };
    });
  const shapes = (t: number): Shape[] =>
    frame(clamp(t)).map(({ start, cubics, closed }) => ({ nodes: cubicNodes(start, cubics, closed), closed, width: 1 }));
  return {
    slots,
    at: (t) => {
      if (t <= 0) return ends(a, slots);
      if (t >= 1) return ends(b, slots);
      return drawn(shapes(t));
    },
    shapes,
    points: (t) => frame(clamp(t)).map(({ start, cubics }) => [start, ...cubics.map((c) => c.to)]),
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

/** Shapes drawn as path data. */
const drawn = (shapes: Shape[]): Stroke[] => shapes.map((shape) => ({ d: nodesData(shape.nodes, shape.closed), width: shape.width }));

/** An icon's strokes exactly as drawn, in the first slots, the rest empty. */
const ends = (paths: Subpath[], slots: number, order?: (number | undefined)[]): Stroke[] =>
  Array.from({ length: slots }, (_, k) => {
    const index = order ? order[k] : k;
    return index === undefined || !paths[index] ? { d: "", width: 1 } : { d: subpathData(paths[index]), width: 1 };
  });

/* ----------------------------------------------------------------------------
 * Matching strokes, and aligning their points
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
 * Lines up the points of two strokes. A closed stroke can start anywhere and run
 * either way, an open one either way; when one is closed and the other open, the
 * closed one opens where its ends will meet best. `by` picks among the ways: by
 * travel (flubber's choice) or by shape, preferring the smaller turn.
 */
function align(a: Prepared, b: Prepared, count: number, by: "travel" | "shape"): Alignment {
  const pa = resample(a.outline, count);
  const pb = resample(b.outline, count);
  const directions = [pb, { ...pb, points: [...pb.points].reverse(), corners: [...pb.corners].reverse() }];
  let best: Alignment | null = null;
  let bestScore = Infinity;
  // Which side turns round (the closed one; the second, if both are).
  const rollFirst = a.outline.closed && !b.outline.closed;
  // A stroke turns only if both ends of it are drawn out: a bar into a bar, not a heart into a star.
  const turning = Math.min(elongation(pa.points), elongation(pb.points)) > TURNS_FROM;
  const shifts = a.outline.closed || b.outline.closed ? count : 1;
  for (const candidate of directions) {
    for (let shift = 0; shift < shifts; shift++) {
      const from = rollFirst ? { ...pa, points: rolled(pa.points, shift), corners: rolled(pa.corners, shift) } : pa;
      const to = rollFirst ? candidate : { ...candidate, points: rolled(candidate.points, shift), corners: rolled(candidate.corners, shift) };
      let travel = 0;
      for (let k = 0; k < count; k++) travel += distance(from.points[k], to.points[k]) ** 2;
      const fit = by === "shape" ? shapeFit(from.points, to.points, turning) : { turn: 0, residual: 0 };
      const score = by === "travel" ? travel : fit.residual + TURN_WEIGHT * fit.turn * fit.turn;
      if (score < bestScore - 1e-12) {
        bestScore = score;
        best = { from, to, residual: fit.residual, turn: fit.turn, travel };
      }
    }
  }
  // Paired by travel, a stroke can still be moved whole: the turn that pairing implies.
  if (by === "travel") return { ...best!, ...shapeFit(best!.from.points, best!.to.points, turning) };
  return best!;
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

/**
 * Which stroke becomes which: every stroke of the icon with fewer is given a
 * partner, the pairing that costs least overall, where a pair costs the distance
 * between them, their difference in length, their difference in shape and the
 * turn between them, and turns that disagree cost more (a plus becomes an x by
 * turning as one). The other icon's spare strokes shrink away or grow in.
 */
function pairStrokes(a: Prepared[], b: Prepared[]): Pairing {
  const alignments = a.map((pa) => b.map((pb) => align(pa, pb, sampleCount(pa, pb), "shape")));
  const cost = (i: number, j: number) => {
    const fit = alignments[i][j];
    return (
      distance(a[i].centroid, b[j].centroid) +
      0.35 * Math.abs(a[i].length - b[j].length) +
      3 * fit.residual +
      1.5 * Math.abs(fit.turn) +
      (a[i].outline.closed === b[j].outline.closed ? 0 : 2)
    );
  };
  const fewer = a.length <= b.length ? "a" : "b";
  const small = fewer === "a" ? a.length : b.length;
  const large = fewer === "a" ? b.length : a.length;

  // Every way to give each of the fewer a different partner among the more, if there aren't too many.
  let bestPick: number[] = [];
  let bestCost = Infinity;
  const total = (pick: number[]) => {
    const turns: number[] = [];
    let sum = 0;
    pick.forEach((partner, k) => {
      const [i, j] = fewer === "a" ? [k, partner] : [partner, k];
      sum += cost(i, j);
      turns.push(alignments[i][j].turn);
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
    // Too many to try: the cheapest pairs first.
    const options = [];
    for (let k = 0; k < small; k++)
      for (let partner = 0; partner < large; partner++)
        options.push({ k, partner, cost: fewer === "a" ? cost(k, partner) : cost(partner, k) });
    options.sort((x, y) => x.cost - y.cost);
    bestPick = Array(small).fill(-1);
    const used = new Set<number>();
    for (const option of options) {
      if (bestPick[option.k] !== -1 || used.has(option.partner)) continue;
      bestPick[option.k] = option.partner;
      used.add(option.partner);
    }
  }

  const pairs = bestPick.map((partner, k) => {
    const [i, j] = fewer === "a" ? [k, partner] : [partner, k];
    return { a: i, b: j, alignment: alignments[i][j] };
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

/**
 * Even, soft, or any of the steps between (`Steps`). `startAt` pairs each closed
 * stroke from that far round from the start it would pick (`startedLater`).
 */
function steppedMorph(a: Subpath[], b: Subpath[], steps: Steps, startAt = 0): Morph & { residual: number } {
  const pa = a.map(prepare);
  const pb = b.map(prepare);
  const pairing = pairStrokes(pa, pb);
  // Curves are drawn through closer points than a polygon's.
  const spacing = steps.curves ? SPACING : EVEN_SPACING;
  const least = steps.curves ? 24 : 2;
  // flubber pairs points by how far they travel; soft keeps the alignment the strokes were paired with.
  const pairs = pairing.pairs.map((pair) => {
    const alignment =
      steps.shape && steps.curves
        ? pair.alignment
        : align(pa[pair.a], pb[pair.b], sampleCount(pa[pair.a], pb[pair.b], spacing, least), steps.shape ? "shape" : "travel");
    return { ...pair, alignment: startAt ? startedLater(alignment, startAt) : alignment };
  });
  const parts = pairs.map(({ alignment }) => rigidParts(alignment.from.points, alignment.to.points, alignment.turn));
  // As densely as paired strokes, or a spare stroke's rounded corners would gather into kinks.
  const lone = (p: Prepared) => {
    const r = resample(p.outline, Math.max(Math.min(240, Math.max(least, Math.round(p.length / spacing))), p.runs + 2));
    return { ...r, centre: centroid(r.points) };
  };
  const vanishing = pairing.onlyA.map((i) => lone(pa[i]));
  const appearing = pairing.onlyB.map((j) => lone(pb[j]));
  const slots = pairs.length + vanishing.length + appearing.length;
  const orderA = [...pairs.map((pair) => pair.a), ...pairing.onlyA, ...appearing.map(() => undefined)];
  const orderB = [...pairs.map((pair) => pair.b), ...vanishing.map(() => undefined), ...pairing.onlyB];

  /** A pair's points at `t`, and how smooth they are at each: sharp only at an end's own corner, near that end. */
  const pairFrame = (k: number, t: number): Frame & { closed: boolean } => {
    const { alignment } = pairs[k];
    const { from, to } = alignment;
    // A stroke closes only once it's the closed one, and if both are.
    const closed = from.closed && to.closed;
    const ease = (i: number) => 1 - Math.max(from.corners[i] ? (1 - t) ** 3 : 0, to.corners[i] ? t ** 3 : 0);
    const softened = (points: Vec[]) => (steps.round ? soften(points, closed, SOFTEST * Math.sin(Math.PI * t)) : points);
    if (!steps.whole) return { points: softened(from.points.map((p, i) => lerpVec(p, to.points[i], t))), closed, ease };
    const { cf, ct, sf, st, shapeFrom, shapeTo } = parts[k];
    const size = sf > 1e-9 && st > 1e-9 ? Math.exp(lerp(Math.log(sf), Math.log(st), t)) : lerp(sf, st, t);
    const centre = lerpVec(cf, ct, t);
    const angle = alignment.turn * t;
    const points = shapeFrom.map((p, i) => {
      const [x, y] = rotate(lerpVec(p, shapeTo[i], t), angle);
      return [centre[0] + size * x, centre[1] + size * y] as Vec;
    });
    return { points: softened(points), closed, ease };
  };

  // Soft's anchors, once for the whole morph: every corner either end has, then as few as fit every frame.
  const pairAnchors = steps.curves
    ? pairs.map(({ alignment }, k) => {
        const forced = alignment.from.corners.map((corner, i) => corner || alignment.to.corners[i]);
        return chooseAnchors(FIT_AT.map((t) => pairFrame(k, t)), alignment.from.closed && alignment.to.closed, forced, TOLERANCE);
      })
    : [];
  // A spare stroke only gathers, its shape the same at every size: its anchors fit it as it is.
  const spareEase = (stroke: Outline) => (i: number) => (stroke.corners[i] ? 0 : 1);
  const spareAnchors = (stroke: Outline) =>
    steps.curves ? chooseAnchors([{ points: stroke.points, ease: spareEase(stroke) }], stroke.closed, stroke.corners, TOLERANCE) : [];
  const spares = [...vanishing, ...appearing].map((stroke) => ({ stroke, anchors: spareAnchors(stroke) }));

  const nodesOf = (frame: Frame, closed: boolean, anchors: number[]): Node[] =>
    steps.curves ? nodesThrough(frame, closed, anchors) : frame.points.map((at) => ({ at }));

  const frame = (t: number) => {
    const strokes: (Frame & { closed: boolean; width: number; anchors: number[] })[] = pairs.map((_, k) => ({
      ...pairFrame(k, t),
      width: 1,
      anchors: pairAnchors[k] ?? [],
    }));
    // Spare strokes gather into a dot: drawn as curves, the dot also shrinks away.
    spares.forEach(({ stroke, anchors }, k) => {
      const amount = k < vanishing.length ? t : 1 - t;
      const pull = steps.curves ? smoothstep(0, 0.75, amount) : amount;
      strokes.push({
        points: stroke.points.map((p) => lerpVec(p, stroke.centre, pull)),
        ease: spareEase(stroke),
        closed: stroke.closed,
        width: steps.curves ? 1 - smoothstep(0.4, 1, amount) : 1,
        anchors,
      });
    });
    return strokes;
  };

  const shapes = (t: number): Shape[] =>
    frame(clamp(t)).map((stroke) => ({ nodes: nodesOf(stroke, stroke.closed, stroke.anchors), closed: stroke.closed, width: stroke.width }));

  return {
    slots,
    at: (t) => {
      if (t <= 0) return ends(a, slots, orderA);
      if (t >= 1) return ends(b, slots, orderB);
      return drawn(shapes(t));
    },
    shapes,
    points: (t) => frame(Math.max(1e-6, Math.min(1 - 1e-6, t))).map((stroke) => stroke.points),
    residual: pairs.reduce((sum, { alignment }) => sum + alignment.residual, 0),
  };
}

/**
 * A morph from one icon to another: soft by default, or one of the other two ways, or even with
 * some of soft's steps. Built once (the matching is the costly part), then drawn at any `t`.
 */
export function morph(from: Icon, to: Icon, way: Method | Steps = "soft"): Morph {
  const a = iconSubpaths(from);
  const b = iconSubpaths(to);
  if (way === "index") return indexMorph(a, b);
  return steppedMorph(a, b, way === "even" ? EVENLY : way === "soft" ? SOFTLY : way);
}

/**
 * Soft's morph with each closed stroke started `fraction` of the way round from
 * the start it picks (0 is soft's own), and how unlike the paired shapes are: 0
 * the same shape, up to 4 opposite. What trying every start is for.
 */
export function startedAt(from: Icon, to: Icon, fraction: number) {
  const m = steppedMorph(iconSubpaths(from), iconSubpaths(to), SOFTLY, fraction);
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
