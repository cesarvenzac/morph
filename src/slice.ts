/**
 * A filled shape cut into parts, one for each of the pieces it becomes: what `split` does with a
 * fill, as a stroke is cut into stretches. The parts are the cells of a power diagram of where
 * the pieces lie, laid onto the shape, weighted until each part holds about its piece's share of
 * the shape; each reaches a hair past its neighbours, so no seam shows while they're together.
 */

import { signedArea, type Vec } from "./geometry.ts";

/** A point of a polygon being cut: one of its own, or where an edge crosses the line, leaving what's kept (1) or coming back into it (-1). */
type Node = { p: Vec; kept: boolean; crossing: 0 | 1 | -1 };

/**
 * The parts of a polygon on one side of a line, those of its points `p` where
 * `normal · p ≤ limit`: none, the polygon itself, or one or more pieces where the line cuts it
 * (a U cut across its arms is two). Each runs the way the polygon does. Null when the cut can't
 * be read (crossings that don't pair up), which a simple polygon never gives.
 */
export function keepBelow(polygon: Vec[], normal: Vec, limit: number): Vec[][] | null {
  const n = polygon.length;
  if (n < 3) return [];
  // How far past the line each point is; one on it counts as kept.
  const past = polygon.map(([x, y]) => {
    const value = normal[0] * x + normal[1] * y - limit;
    return Math.abs(value) < 1e-9 ? -1e-9 : value;
  });
  if (past.every((value) => value <= 0)) return [polygon];
  if (past.every((value) => value > 0)) return [];
  const nodes: Node[] = [];
  for (let k = 0; k < n; k++) {
    const [a, b] = [past[k], past[(k + 1) % n]];
    nodes.push({ p: polygon[k], kept: a <= 0, crossing: 0 });
    if (a <= 0 !== b <= 0) {
      const [p, q] = [polygon[k], polygon[(k + 1) % n]];
      const u = a / (a - b);
      nodes.push({ p: [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u], kept: true, crossing: a <= 0 ? 1 : -1 });
    }
  }
  // Along the line, it's inside the polygon from the first crossing to the second, the third to the fourth…
  const along = ([x, y]: Vec) => -normal[1] * x + normal[0] * y;
  const crossings = nodes.flatMap((node, k) => (node.crossing ? [k] : [])).sort((i, j) => along(nodes[i].p) - along(nodes[j].p));
  if (crossings.length % 2) return null;
  const partner = new Map<number, number>();
  for (let k = 0; k < crossings.length; k += 2) {
    const [i, j] = [crossings[k], crossings[k + 1]];
    if (nodes[i].crossing === nodes[j].crossing) return null;
    partner.set(i, j);
    partner.set(j, i);
  }
  // Each part: round the polygon from a point kept, across the line wherever it leaves, until back.
  const parts: Vec[][] = [];
  const seen = new Uint8Array(nodes.length);
  for (let start = 0; start < nodes.length; start++) {
    if (seen[start] || !nodes[start].kept || nodes[start].crossing) continue;
    const part: Vec[] = [];
    let k = start;
    let closed = false;
    for (let guard = 0; guard <= nodes.length && !closed; guard++) {
      seen[k] = 1;
      part.push(nodes[k].p);
      if (nodes[k].crossing === 1) {
        k = partner.get(k)!;
        seen[k] = 1;
        part.push(nodes[k].p);
      }
      k = (k + 1) % nodes.length;
      closed = k === start;
    }
    if (!closed) return null;
    parts.push(part);
  }
  return parts;
}

/** How many times the weights are set again, each part's area brought nearer its share. */
const ROUNDS = 12;
/** A part whose area is less than this share of the shape's is a crumb, left out. */
const CRUMB = 1e-3;
/** A cell can come out in pieces (a crescent cut through its middle): the rest of it can't be more than this share of it. */
const STRAY = 0.03;

/**
 * A filled polygon cut into a part for each of `sites`: the cells of their power diagram, each
 * holding about its `shares` of the area (shares sum to 1), each reaching `margin` past its
 * neighbours. Null when a cell comes out empty, or in two pieces of any size.
 */
export function partition(polygon: Vec[], sites: Vec[], shares: number[], margin: number): Vec[][] | null {
  const count = sites.length;
  if (count === 1) return [polygon];
  const whole = Math.abs(signedArea(polygon));
  if (whole < 1e-12) return null;
  // Sites in the same place cut nothing between them: set them a little apart.
  const spread = sites.map(([x, y], k) => [x + k * 1e-6, y] as Vec);
  // How far apart sites are, to weigh them on the scale of the shape.
  let near = Infinity;
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) near = Math.min(near, Math.hypot(spread[i][0] - spread[j][0], spread[i][1] - spread[j][1]));

  const cell = (i: number, weights: number[], reach: number): Vec[][] | null => {
    let parts: Vec[][] = [polygon];
    const [xi, yi] = spread[i];
    for (let j = 0; j < count && parts.length; j++) {
      if (j === i) continue;
      const [xj, yj] = spread[j];
      const length = Math.hypot(xj - xi, yj - yi);
      const normal: Vec = [(xj - xi) / length, (yj - yi) / length];
      const limit = (xj * xj + yj * yj - xi * xi - yi * yi + weights[i] - weights[j]) / (2 * length) + reach;
      const next: Vec[][] = [];
      for (const part of parts) {
        const kept = keepBelow(part, normal, limit);
        if (!kept) return null;
        next.push(...kept);
      }
      parts = next;
    }
    return parts.filter((part) => Math.abs(signedArea(part)) > CRUMB * whole);
  };

  // Weights move each boundary toward the cell that holds too little: by its shortfall, over how long the cut is.
  const weights = new Array<number>(count).fill(0);
  for (let round = 0; round < ROUNDS; round++) {
    const areas: number[] = [];
    for (let i = 0; i < count; i++) {
      const parts = cell(i, weights, 0);
      if (!parts) return null;
      areas.push(parts.reduce((sum, part) => sum + Math.abs(signedArea(part)), 0));
    }
    const off = areas.map((area, i) => shares[i] * whole - area);
    if (off.every((value) => Math.abs(value) < 0.01 * whole)) break;
    // Moving a boundary d along takes about d times its length; a weight w moves it w / (2 × the sites' distance).
    const across = Math.sqrt(whole);
    for (let i = 0; i < count; i++) weights[i] += (0.8 * off[i] * near) / across;
    const mean = weights.reduce((sum, w) => sum + w, 0) / count;
    for (let i = 0; i < count; i++) weights[i] -= mean;
  }

  const parts: Vec[][] = [];
  for (let i = 0; i < count; i++) {
    const pieces = cell(i, weights, margin);
    if (!pieces?.length) return null;
    const sizes = pieces.map((piece) => Math.abs(signedArea(piece)));
    const largest = sizes.indexOf(Math.max(...sizes));
    const rest = sizes.reduce((sum, size) => sum + size, 0) - sizes[largest];
    if (rest > STRAY * sizes[largest]) return null;
    parts.push(pieces[largest]);
  }
  return parts;
}
