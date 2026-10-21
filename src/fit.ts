/**
 * Drawing a stroke's points as a path a designer would draw: a few anchors, each
 * with its handles, Figma's way, rather than a curve through every point.
 *
 * The anchors are chosen once for a whole morph (`chooseAnchors`): every corner
 * either icon has, then as few others as keep every frame within `tolerance` of
 * its points. Each frame then fits one cubic between each pair of anchors
 * (`nodesThrough`), so the anchors glide from frame to frame instead of popping
 * in and out, and the handles you see are the curve you see.
 */

import type { Vec } from "./geometry.ts";

/** A point of a path, as an editor shows it: where it is, and its handles, if it has any. */
export type Node = { at: Vec; in?: Vec; out?: Vec };

/** A stroke's points at one moment, and how smooth it is at each: 1 smooth, 0 a sharp corner. */
export type Frame = { points: Vec[]; ease: (k: number) => number };

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const length = (a: Vec) => Math.hypot(a[0], a[1]);
const unit = (a: Vec): Vec => {
  const l = length(a);
  return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l];
};

/**
 * The way the stroke runs arriving at point `k` and leaving it, both pointing
 * along the stroke: the same where it's smooth, each side's own at a corner.
 */
function tangents(points: Vec[], closed: boolean, k: number, ease: number) {
  const n = points.length;
  const p = points[k];
  const before = closed || k > 0 ? points[(k - 1 + n) % n] : null;
  const after = closed || k < n - 1 ? points[(k + 1) % n] : null;
  const backward = before ? unit(sub(p, before)) : null;
  const forward = after ? unit(sub(after, p)) : null;
  if (!backward) return { into: forward ?? [0, 0], out: forward ?? [0, 0] };
  if (!forward) return { into: backward, out: backward };
  const smooth = unit(sub(after!, before!));
  return {
    into: unit(add(scale(backward, 1 - ease), scale(smooth, ease))),
    out: unit(add(scale(forward, 1 - ease), scale(smooth, ease))),
  };
}

const bezier = (p0: Vec, c1: Vec, c2: Vec, p3: Vec, u: number): Vec => {
  const v = 1 - u;
  return [
    v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p3[1],
  ];
};

/**
 * One cubic through `samples`, from the first to the last, leaving along `out`
 * and arriving along `into`: the handle lengths that fit the points between best
 * (least squares, as in Schneider's curve fitting), and how far off it is.
 */
export function fitSpan(samples: Vec[], out: Vec, into: Vec) {
  const p0 = samples[0];
  const p3 = samples[samples.length - 1];
  const chord = length(sub(p3, p0));
  // Each sample's place along the curve, first by distance along the points, then refined.
  const u = [0];
  for (let k = 1; k < samples.length; k++) u.push(u[k - 1] + length(sub(samples[k], samples[k - 1])));
  const total = u[u.length - 1];
  for (let k = 0; k < u.length; k++) u[k] = total < 1e-12 ? k / Math.max(1, u.length - 1) : u[k] / total;
  const back = scale(into, -1);

  const handles = () => {
    let c11 = 0;
    let c12 = 0;
    let c22 = 0;
    let x1 = 0;
    let x2 = 0;
    for (let k = 0; k < samples.length; k++) {
      const t = u[k];
      const v = 1 - t;
      const b1 = 3 * t * v * v;
      const b2 = 3 * t * t * v;
      const a1 = scale(out, b1);
      const a2 = scale(back, b2);
      c11 += dot(a1, a1);
      c12 += dot(a1, a2);
      c22 += dot(a2, a2);
      const rest = sub(samples[k], add(scale(p0, v * v * v + b1), scale(p3, b2 + t * t * t)));
      x1 += dot(a1, rest);
      x2 += dot(a2, rest);
    }
    const det = c11 * c22 - c12 * c12;
    let first = Math.abs(det) > 1e-12 ? (x1 * c22 - x2 * c12) / det : chord / 3;
    let second = Math.abs(det) > 1e-12 ? (c11 * x2 - c12 * x1) / det : chord / 3;
    // A handle backwards, or longer than the span, would loop: a third of the way instead.
    if (!(first > 1e-6 * chord) || first > chord) first = chord / 3;
    if (!(second > 1e-6 * chord) || second > chord) second = chord / 3;
    return { c1: add(p0, scale(out, first)), c2: add(p3, scale(back, second)) };
  };

  let { c1, c2 } = handles();
  // Two Newton steps move each sample's place to the nearest point of the curve, then refit.
  for (let pass = 0; pass < 2 && samples.length > 2; pass++) {
    for (let k = 1; k < samples.length - 1; k++) {
      const t = u[k];
      const v = 1 - t;
      const q = bezier(p0, c1, c2, p3, t);
      const d1: Vec = [
        3 * v * v * (c1[0] - p0[0]) + 6 * v * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]),
        3 * v * v * (c1[1] - p0[1]) + 6 * v * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]),
      ];
      const d2: Vec = [
        6 * v * (c2[0] - 2 * c1[0] + p0[0]) + 6 * t * (p3[0] - 2 * c2[0] + c1[0]),
        6 * v * (c2[1] - 2 * c1[1] + p0[1]) + 6 * t * (p3[1] - 2 * c2[1] + c1[1]),
      ];
      const diff = sub(q, samples[k]);
      const denominator = dot(d1, d1) + dot(diff, d2);
      if (Math.abs(denominator) > 1e-12) u[k] = Math.max(0, Math.min(1, t - dot(diff, d1) / denominator));
    }
    ({ c1, c2 } = handles());
  }

  let error = 0;
  for (let k = 1; k < samples.length - 1; k++) error = Math.max(error, length(sub(bezier(p0, c1, c2, p3, u[k]), samples[k])));
  return { c1, c2, error };
}

/** The points from anchor `from` to anchor `to`, round the end of a closed stroke if `to` is past it. */
const span = (points: Vec[], from: number, to: number) => {
  const n = points.length;
  const out: Vec[] = [];
  for (let k = from; k <= to; k++) out.push(points[k % n]);
  return out;
};

function fitBetween(frame: Frame, closed: boolean, from: number, to: number) {
  const n = frame.points.length;
  const start = tangents(frame.points, closed, from % n, frame.ease(from % n));
  const end = tangents(frame.points, closed, to % n, frame.ease(to % n));
  return fitSpan(span(frame.points, from, to), start.out, end.into);
}

/**
 * Which points are anchors, for every frame of a morph: those `forced` (corners,
 * and an open stroke's ends), then, between them, as few as keep every one of
 * `frames` within `tolerance` of its points. Indices, in order, each under the
 * stroke's point count.
 */
export function chooseAnchors(frames: Frame[], closed: boolean, forced: boolean[], tolerance: number): number[] {
  const n = forced.length;
  if (n < 2) return n ? [0] : [];
  const fits = (from: number, to: number) => frames.every((frame) => fitBetween(frame, closed, from, to).error <= tolerance);
  // A closed stroke starts at a corner if it has one, and goes once round, back to it.
  const first = closed ? Math.max(0, forced.indexOf(true)) : 0;
  const last = closed ? first + n : n - 1;
  const isForced = (k: number) => k === first || k === last || forced[k % n];
  const anchors = [first];
  let current = first;
  while (current < last) {
    // The span may reach the next forced anchor and no further.
    let limit = current + 1;
    while (limit < last && !isForced(limit)) limit++;
    // The farthest end that still fits: gallop out from the next point, then halve back.
    let next = current + 1;
    let failed = Infinity;
    for (let step = 1; next < limit; step *= 2) {
      const probe = Math.min(limit, next + step);
      if (!fits(current, probe)) {
        failed = probe;
        break;
      }
      next = probe;
    }
    while (failed - next > 1 && failed !== Infinity) {
      const middle = Math.floor((next + failed) / 2);
      if (fits(current, middle)) next = middle;
      else failed = middle;
    }
    // Once round, a closed stroke needs at least two other anchors: one cubic can't close a loop.
    if (closed && next === last && anchors.length < 3) next = Math.min(last - 1, current + Math.max(1, Math.floor((last - current) / (4 - anchors.length))));
    anchors.push(next);
    current = next;
  }
  if (closed) anchors.pop();
  return anchors.map((k) => k % n);
}

/** A frame drawn through `anchors`: one fitted cubic between each, as nodes with handles. */
export function nodesThrough(frame: Frame, closed: boolean, anchors: number[]): Node[] {
  const n = frame.points.length;
  if (anchors.length < 2) return anchors.map((k) => ({ at: frame.points[k] }));
  const nodes: Node[] = anchors.map((k) => ({ at: frame.points[k] }));
  const spans = closed ? anchors.length : anchors.length - 1;
  for (let s = 0; s < spans; s++) {
    const from = anchors[s];
    let to = anchors[(s + 1) % anchors.length];
    if (to <= from) to += n;
    const { c1, c2 } = fitBetween(frame, closed, from, to);
    nodes[s].out = c1;
    nodes[(s + 1) % anchors.length].in = c2;
  }
  return nodes;
}

/** Nodes as SVG path data, `digits` decimals a number: a cubic where either side has a handle, a line where neither does. */
export function nodesData(nodes: Node[], closed: boolean, digits = 3) {
  if (!nodes.length) return "";
  const round = (value: number) => Number(value.toFixed(digits)).toString();
  const text = (p: Vec) => `${round(p[0])} ${round(p[1])}`;
  let d = `M${text(nodes[0].at)}`;
  const segments = closed ? nodes.length : nodes.length - 1;
  for (let k = 0; k < segments; k++) {
    const a = nodes[k];
    const b = nodes[(k + 1) % nodes.length];
    if (!a.out && !b.in) d += `L${text(b.at)}`;
    else d += `C${text(a.out ?? a.at)} ${text(b.in ?? b.at)} ${text(b.at)}`;
  }
  return closed ? `${d}Z` : d;
}
