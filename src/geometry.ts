/**
 * An icon's strokes as geometry: SVG elements parsed into subpaths of lines and
 * cubic Béziers (every other command, arcs included, becomes one of those two),
 * then laid out as dense polylines that know where their corners are, and
 * resampled evenly along their length, corners kept, so two strokes can be
 * matched point for point.
 */

export type Vec = [number, number];

/** An element as Lucide writes its icons: a tag and its attributes (numbers too, as its types allow). */
export type IconElement = readonly [tag: string, attributes: Readonly<Record<string, string | number | undefined>>];

export type Segment = { kind: "line"; to: Vec } | { kind: "cubic"; c1: Vec; c2: Vec; to: Vec };

/** One stroke as drawn: where it starts, what it's made of, and whether it closes. */
export type Subpath = { start: Vec; segments: Segment[]; closed: boolean };

/** One stroke laid out as a polyline. `corners[i]` marks a point where it turns sharply (or ends). */
export type Outline = { points: Vec[]; closed: boolean; corners: boolean[] };

/** A turn sharper than this, in radians, between one segment and the next is a corner. */
const CORNER = (22 * Math.PI) / 180;

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ----------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------- */

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/** Path data into subpaths of lines and cubics, absolute. Every command SVG has. */
export function parsePath(d: string): Subpath[] {
  const subpaths: Subpath[] = [];
  let i = 0;
  let command = "";
  let current: Vec = [0, 0];
  let start: Vec = [0, 0];
  let subpath: Subpath | null = null;
  // The last control point, for the reflections of S and T.
  let lastCubic: Vec | null = null;
  let lastQuad: Vec | null = null;

  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const number = () => {
    skip();
    const match = NUMBER.exec(d.slice(i));
    if (!match) throw new Error(`Expected a number at ${i} in "${d}"`);
    i += match[0].length;
    return Number(match[0]);
  };
  const flag = () => {
    skip();
    const char = d[i];
    if (char !== "0" && char !== "1") throw new Error(`Expected a flag at ${i} in "${d}"`);
    i++;
    return char === "1";
  };
  const more = () => {
    skip();
    return i < d.length && /[+\-.\d]/.test(d[i]);
  };
  const point = (relative: boolean): Vec => {
    const x = number();
    const y = number();
    return relative ? [current[0] + x, current[1] + y] : [x, y];
  };
  const open = () => {
    if (!subpath) {
      subpath = { start: current, segments: [], closed: false };
      subpaths.push(subpath);
    }
    return subpath;
  };
  const line = (to: Vec) => {
    open().segments.push({ kind: "line", to });
    current = to;
  };
  const cubic = (c1: Vec, c2: Vec, to: Vec) => {
    open().segments.push({ kind: "cubic", c1, c2, to });
    current = to;
  };

  while (true) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) command = d[i++];
    else if (!command) throw new Error(`Path data must start with a command: "${d}"`);
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const wasCubic: Vec | null = lastCubic;
    const wasQuad: Vec | null = lastQuad;
    lastCubic = null;
    lastQuad = null;

    switch (upper) {
      case "M": {
        current = point(relative);
        start = current;
        subpath = null;
        // Pairs after the first are lines.
        command = relative ? "l" : "L";
        break;
      }
      case "L":
        line(point(relative));
        break;
      case "H": {
        const x = number();
        line([relative ? current[0] + x : x, current[1]]);
        break;
      }
      case "V": {
        const y = number();
        line([current[0], relative ? current[1] + y : y]);
        break;
      }
      case "C": {
        const c1 = point(relative);
        const c2 = point(relative);
        const to = point(relative);
        cubic(c1, c2, to);
        lastCubic = c2;
        break;
      }
      case "S": {
        const c1 = wasCubic ? sub(scale(current, 2), wasCubic) : current;
        const c2 = point(relative);
        const to = point(relative);
        cubic(c1, c2, to);
        lastCubic = c2;
        break;
      }
      case "Q": {
        const q = point(relative);
        const to = point(relative);
        quadratic(current, q, to, cubic);
        lastQuad = q;
        break;
      }
      case "T": {
        const q: Vec = wasQuad ? sub(scale(current, 2), wasQuad) : current;
        const to = point(relative);
        quadratic(current, q, to, cubic);
        lastQuad = q;
        break;
      }
      case "A": {
        const rx = number();
        const ry = number();
        const rotation = number();
        const large = flag();
        const sweep = flag();
        const to = point(relative);
        for (const piece of arc(current, to, rx, ry, rotation, large, sweep)) {
          if (piece.kind === "line") line(piece.to);
          else cubic(piece.c1, piece.c2, piece.to);
        }
        break;
      }
      case "Z": {
        const path = open();
        if (distance(current, start) > 1e-9) line(start);
        path.closed = true;
        current = start;
        subpath = null;
        break;
      }
      default:
        throw new Error(`Unknown path command "${command}"`);
    }
    // A command's numbers repeat it until the next letter (M's repeat as L, set above); Z takes none.
    if (upper === "Z" && more()) throw new Error(`Numbers after Z in "${d}"`);
  }
  return subpaths.filter((path) => path.segments.length > 0);
}

function quadratic(from: Vec, q: Vec, to: Vec, cubic: (c1: Vec, c2: Vec, to: Vec) => void) {
  cubic(lerp(from, q, 2 / 3), lerp(to, q, 2 / 3), to);
}

/** An SVG arc as cubics of at most a quarter turn each (SVG's endpoint parameterisation). */
export function arc(from: Vec, to: Vec, rx: number, ry: number, degrees: number, large: boolean, sweep: boolean): Segment[] {
  if (distance(from, to) < 1e-12) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-12 || ry < 1e-12) return [{ kind: "line", to }];
  const phi = (degrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Radii too small for the chord grow until they just reach.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const root = Math.sqrt(Math.max(0, numerator / denominator)) * (large === sweep ? -1 : 1);
  const cx1 = (root * rx * y1) / ry;
  const cy1 = (-root * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Vec => {
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cos * x - sin * y + cx, sin * x + cos * y + cy];
  };
  const tangent = (t: number): Vec => {
    const x = -rx * Math.sin(t);
    const y = ry * Math.cos(t);
    return [cos * x - sin * y, sin * x + cos * y];
  };
  const segments: Segment[] = [];
  for (let piece = 0; piece < pieces; piece++) {
    const a = theta1 + piece * step;
    const b = a + step;
    const p0 = at(a);
    const p3 = piece === pieces - 1 ? to : at(b);
    segments.push({ kind: "cubic", c1: add(p0, scale(tangent(a), k)), c2: sub(p3, scale(tangent(b), k)), to: p3 });
  }
  return segments;
}

/** One of Lucide's elements as path data. */
export function elementPath([tag, attributes]: IconElement): string {
  const number = (name: string, fallback = 0) => {
    const value = attributes[name];
    return value === undefined ? fallback : Number(value);
  };
  switch (tag) {
    case "path":
      return String(attributes.d ?? "");
    case "line":
      return `M${number("x1")} ${number("y1")}L${number("x2")} ${number("y2")}`;
    case "polyline":
    case "polygon": {
      const values = String(attributes.points ?? "").trim().split(/[\s,]+/).map(Number);
      const pairs = [];
      for (let k = 0; k + 1 < values.length; k += 2) pairs.push(`${values[k]} ${values[k + 1]}`);
      return `M${pairs.join("L")}${tag === "polygon" ? "Z" : ""}`;
    }
    case "circle":
    case "ellipse": {
      const cx = number("cx");
      const cy = number("cy");
      const rx = tag === "circle" ? number("r") : number("rx");
      const ry = tag === "circle" ? number("r") : number("ry");
      const quarter = `A${rx} ${ry} 0 0 1`;
      return `M${cx + rx} ${cy}${quarter} ${cx} ${cy + ry}${quarter} ${cx - rx} ${cy}${quarter} ${cx} ${cy - ry}${quarter} ${cx + rx} ${cy}Z`;
    }
    case "rect": {
      const x = number("x");
      const y = number("y");
      const w = number("width");
      const h = number("height");
      let rx = attributes.rx === undefined ? number("ry") : number("rx");
      let ry = attributes.ry === undefined ? rx : number("ry");
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      const corner = `A${rx} ${ry} 0 0 1`;
      return (
        `M${x + rx} ${y}H${x + w - rx}${corner} ${x + w} ${y + ry}V${y + h - ry}${corner} ${x + w - rx} ${y + h}` +
        `H${x + rx}${corner} ${x} ${y + h - ry}V${y + ry}${corner} ${x + rx} ${y}Z`
      );
    }
    default:
      throw new Error(`Unknown icon element "${tag}"`);
  }
}

/**
 * An icon as the package takes it: SVG path data, a list of it (one stroke or more each),
 * or elements as Lucide writes its icons (`import { Plus } from "lucide"`).
 */
export type Icon = string | readonly string[] | readonly IconElement[];

/** An icon as elements, whichever way it came. */
export function iconElements(icon: Icon): readonly IconElement[] {
  if (typeof icon === "string") return [["path", { d: icon }]];
  return icon.map((item) => (typeof item === "string" ? (["path", { d: item }] as const) : item));
}

/** Every stroke of an icon, each subpath of each element on its own. */
export const iconSubpaths = (icon: Icon) => iconElements(icon).flatMap((element) => parsePath(elementPath(element)));

/** A subpath back as path data, exactly: lines and cubics, absolute. */
export function subpathData(path: Subpath, digits = 3): string {
  const f = (value: number) => Number(value.toFixed(digits)).toString();
  const v = (p: Vec) => `${f(p[0])} ${f(p[1])}`;
  let d = `M${v(path.start)}`;
  for (const segment of path.segments) {
    d += segment.kind === "line" ? `L${v(segment.to)}` : `C${v(segment.c1)} ${v(segment.c2)} ${v(segment.to)}`;
  }
  return path.closed ? `${d}Z` : d;
}

/* ----------------------------------------------------------------------------
 * Outlines
 * ------------------------------------------------------------------------- */

const cubicAt = (p0: Vec, c1: Vec, c2: Vec, p3: Vec, t: number): Vec => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + e * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + e * p3[1]];
};

/** Which way a segment leaves its start, and arrives at its end, skipping coincident control points. */
function directions(from: Vec, segment: Segment): [Vec, Vec] {
  if (segment.kind === "line") {
    const d = sub(segment.to, from);
    return [d, d];
  }
  const points = [from, segment.c1, segment.c2, segment.to];
  const near = (a: Vec, b: Vec) => distance(a, b) < 1e-9;
  const leave = points.slice(1).find((p) => !near(p, from)) ?? segment.to;
  const reach = [...points].reverse().slice(1).find((p) => !near(p, segment.to)) ?? from;
  return [sub(leave, from), sub(segment.to, reach)];
}

const turn = (a: Vec, b: Vec) => {
  const length = Math.hypot(...a) * Math.hypot(...b);
  if (length < 1e-12) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / length)));
};

/** A subpath laid out as a polyline fine enough to measure along, `step` units or less a piece. */
export function outline(path: Subpath, step = 0.1): Outline {
  const points: Vec[] = [path.start];
  const corners: boolean[] = [!path.closed];
  const arrivals: Vec[] = [];
  const departures: Vec[] = [];
  // Where each segment ends, among the points.
  const ends: number[] = [];
  let from = path.start;
  for (const segment of path.segments) {
    const [leave, reach] = directions(from, segment);
    departures.push(leave);
    arrivals.push(reach);
    if (segment.kind === "line") {
      points.push(segment.to);
      corners.push(false);
    } else {
      const length = distance(from, segment.c1) + distance(segment.c1, segment.c2) + distance(segment.c2, segment.to);
      const pieces = Math.max(4, Math.ceil(length / step));
      for (let k = 1; k <= pieces; k++) {
        points.push(cubicAt(from, segment.c1, segment.c2, segment.to, k / pieces));
        corners.push(false);
      }
    }
    ends.push(points.length - 1);
    from = segment.to;
  }
  // Where one segment ends and the next begins, a sharp turn is a corner.
  for (let k = 0; k + 1 < path.segments.length; k++) {
    if (turn(arrivals[k], departures[k + 1]) > CORNER) corners[ends[k]] = true;
  }
  if (path.closed) {
    // The closing point repeats the start: the turn there is from the last segment into the first.
    points.pop();
    corners.pop();
    corners[0] = turn(arrivals[arrivals.length - 1], departures[0]) > CORNER;
  } else {
    corners[corners.length - 1] = true;
  }
  // Coincident neighbours (a zero-length piece) would divide by nothing later on.
  const keptPoints: Vec[] = [];
  const keptCorners: boolean[] = [];
  points.forEach((p, k) => {
    if (keptPoints.length && distance(keptPoints[keptPoints.length - 1], p) < 1e-9) {
      keptCorners[keptCorners.length - 1] ||= corners[k];
      return;
    }
    keptPoints.push(p);
    keptCorners.push(corners[k]);
  });
  return { points: keptPoints, closed: path.closed, corners: keptCorners };
}

/** How long an outline is, end to end, or once round. */
export function outlineLength({ points, closed }: Outline) {
  let length = 0;
  for (let k = 1; k < points.length; k++) length += distance(points[k - 1], points[k]);
  if (closed && points.length > 1) length += distance(points[points.length - 1], points[0]);
  return length;
}

/** The corners of an outline, as the stretches between them: what resampling must keep whole. */
export const runCount = (o: Outline) => Math.max(1, o.corners.filter(Boolean).length - (o.closed ? 0 : 1));

/**
 * `count` points spread evenly along an outline, its corners among them exactly:
 * the stretches between corners each get points in proportion to their length.
 * An open outline keeps both its ends.
 */
export function resample(o: Outline, count: number): Outline {
  const { points, closed } = o;
  const n = points.length;
  if (n === 1) return { points: Array.from({ length: count }, () => points[0]), closed, corners: Array(count).fill(false) };
  // Arc length at each point, and once round for a closed outline.
  const at = [0];
  for (let k = 1; k < n; k++) at.push(at[k - 1] + distance(points[k - 1], points[k]));
  const total = closed ? at[n - 1] + distance(points[n - 1], points[0]) : at[n - 1];
  const pointAt = (s: number): Vec => {
    if (closed) s = ((s % total) + total) % total;
    else s = Math.max(0, Math.min(total, s));
    let lo = 0;
    let hi = n - 1;
    if (closed && s >= at[n - 1]) return lerp(points[n - 1], points[0], (s - at[n - 1]) / (total - at[n - 1] || 1));
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lerp(points[lo], points[hi], (s - at[lo]) / (at[hi] - at[lo] || 1));
  };

  let marks = o.corners.flatMap((corner, k) => (corner ? [at[k]] : []));
  if (!closed) marks = [...new Set([0, ...marks, total])];
  if (marks.length === 0) marks = [0];
  // Stretches from each corner to the next (round to the first again when closed).
  const stretches = closed
    ? marks.map((from, k) => ({ from, length: (k + 1 < marks.length ? marks[k + 1] : marks[0] + total) - from }))
    : marks.slice(0, -1).map((from, k) => ({ from, length: marks[k + 1] - from }));
  const available = closed ? count : count - 1;
  if (available < stretches.length) throw new Error(`${count} points can't keep ${stretches.length} corners`);
  const shares = stretches.map((stretch) => (available * stretch.length) / (total || 1));
  const counts = shares.map((share) => Math.max(1, Math.floor(share)));
  // Largest remainders take what's left; a stretch already over its share gives back.
  let left = available - counts.reduce((sum, c) => sum + c, 0);
  const order = shares.map((share, k) => ({ k, rest: share - Math.floor(share) })).sort((a, b) => b.rest - a.rest);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k].k]++;
  for (let k = 0; left < 0; k = (k + 1) % counts.length) {
    if (counts[k] > 1) {
      counts[k]--;
      left++;
    }
  }

  const sampled: Vec[] = [];
  const corners: boolean[] = [];
  stretches.forEach((stretch, k) => {
    for (let j = 0; j < counts[k]; j++) {
      sampled.push(pointAt(stretch.from + (stretch.length * j) / counts[k]));
      corners.push(j === 0 && (closed ? o.corners.some(Boolean) : true));
    }
  });
  if (!closed) {
    sampled.push(points[n - 1]);
    corners.push(true);
  }
  return { points: sampled, closed, corners };
}

/* ----------------------------------------------------------------------------
 * Areas, insides and pieces of outlines
 * ------------------------------------------------------------------------- */

/** The area a closed polygon encloses, signed by the way it runs: positive clockwise on screen (y down). */
export function signedArea(points: Vec[]) {
  let area = 0;
  for (let k = 0; k < points.length; k++) {
    const [x0, y0] = points[k];
    const [x1, y1] = points[(k + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}

/** Whether a point is inside a polygon (crossings counted, even-odd). */
export function inside([x, y]: Vec, polygon: Vec[]) {
  let within = false;
  for (let k = 0, j = polygon.length - 1; k < polygon.length; j = k++) {
    const [xk, yk] = polygon[k];
    const [xj, yj] = polygon[j];
    if (yk > y !== yj > y && x < ((xj - xk) * (y - yk)) / (yj - yk) + xk) within = !within;
  }
  return within;
}

/** How far along an outline the point nearest `p` is, as a length from its first point. */
export function nearestAlong({ points, closed }: Outline, p: Vec) {
  let best = Infinity;
  let at = 0;
  let along = 0;
  const count = closed ? points.length : points.length - 1;
  for (let k = 0; k < count; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    const span = distance(a, b);
    const u = span < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (span * span)));
    const d = distance(p, lerp(a, b, u));
    if (d < best) {
      best = d;
      at = along + u * span;
    }
    along += span;
  }
  return points.length === 1 ? 0 : at;
}

/**
 * The stretch of an outline from length `from` to length `to` along it, as an open subpath of
 * lines: every point between, and the ends where they fall. A closed outline goes round past
 * its first point when `to` is past its length.
 */
export function stretchOf(o: Outline, from: number, to: number): Subpath {
  const { points, closed } = o;
  const total = outlineLength(o);
  const n = points.length;
  const at = [0];
  for (let k = 1; k < n; k++) at.push(at[k - 1] + distance(points[k - 1], points[k]));
  // The point at length s, and which piece it's on, for a length anywhere on the outline (round again if closed).
  const pointAt = (s: number): Vec => {
    if (closed) s = ((s % total) + total) % total;
    else s = Math.max(0, Math.min(total, s));
    if (closed && s >= at[n - 1]) return lerp(points[n - 1], points[0], (s - at[n - 1]) / (total - at[n - 1] || 1));
    let k = 1;
    while (k < n - 1 && at[k] < s) k++;
    return lerp(points[k - 1], points[k], (s - at[k - 1]) / (at[k] - at[k - 1] || 1));
  };
  const start = pointAt(from);
  const segments: Segment[] = [];
  // Every point of the outline strictly between the two lengths, once round at most.
  const rounds = closed ? [0, total] : [0];
  for (const round of rounds) {
    for (let k = 0; k < n; k++) {
      const s = at[k] + round;
      if (s > from + 1e-9 && s < to - 1e-9) segments.push({ kind: "line", to: points[k] });
    }
  }
  segments.push({ kind: "line", to: pointAt(to) });
  return { start, segments, closed: false };
}

/** `count` points evenly spaced along an outline by length: the middles of `count` equal stretches. */
export function pointsAlong(o: Outline, count: number): Vec[] {
  const total = outlineLength(o);
  const { points, closed } = o;
  const n = points.length;
  if (n === 1 || total < 1e-12) return Array.from({ length: count }, () => points[0]);
  const out: Vec[] = [];
  let k = 0;
  let before = 0;
  for (let i = 0; i < count; i++) {
    const s = ((i + 0.5) * total) / count;
    // Walk on to the piece that holds s (round to the first point again, when closed).
    while (true) {
      const next = k + 1 < n ? points[k + 1] : closed ? points[0] : points[k];
      const span = distance(points[k], next);
      if (before + span >= s || k + 1 >= (closed ? n : n - 1)) {
        out.push(lerp(points[k], next, span < 1e-12 ? 0 : Math.min(1, (s - before) / span)));
        break;
      }
      before += span;
      k++;
    }
  }
  return out;
}
