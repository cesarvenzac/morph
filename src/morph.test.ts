import { describe, expect, it } from "vitest";

import { distance, iconSubpaths, subpathData, type Vec } from "./geometry.ts";
import { ICONS, PAIRS } from "./icons.fixture.ts";
import { nodesData } from "./fit.ts";
import { elongation, EVENLY, morph, sharpestTurn, SOFTLY, soften, startedAt, type Method, type Steps } from "./morph.ts";

const METHODS: Method[] = ["index", "even", "soft"];

const length = (points: Vec[]) => points.slice(1).reduce((sum, p, k) => sum + distance(points[k], p), 0);

describe("every method", () => {
  for (const method of METHODS) {
    for (const { from, to } of PAIRS) {
      it(`${method}: draws ${from} and ${to} exactly at the ends`, () => {
        const m = morph(ICONS[from], ICONS[to], method);
        const exact = (name: keyof typeof ICONS) => iconSubpaths(ICONS[name]).map((path) => subpathData(path)).sort();
        const drawn = (t: number) =>
          m
            .at(t)
            .map((stroke) => stroke.d)
            .filter(Boolean)
            .sort();
        expect(drawn(0)).toEqual(exact(from));
        expect(drawn(1)).toEqual(exact(to));
        expect(m.at(0)).toHaveLength(m.slots);
        expect(m.at(0.5)).toHaveLength(m.slots);
      });
    }
  }

  it("draws something sensible all the way through, never NaN", () => {
    for (const method of METHODS) {
      for (const { from, to } of PAIRS) {
        const m = morph(ICONS[from], ICONS[to], method);
        for (let k = 1; k < 10; k++) for (const stroke of m.at(k / 10)) expect(stroke.d).not.toMatch(/NaN|Infinity/);
      }
    }
  });
});

describe("soft", () => {
  it("turns a plus into an x as one, every stroke keeping its length", () => {
    const soft = morph(ICONS.plus, ICONS.x, "soft");
    const even = morph(ICONS.plus, ICONS.x, "even");
    // 14 long as a plus, 17 as an x: turning, a stroke grows steadily from one to the other.
    for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      for (const stroke of soft.points(t)) {
        expect(length(stroke)).toBeCloseTo(Math.exp(Math.log(14) + t * (Math.log(16.97) - Math.log(14))), 0);
      }
    }
    // Pointwise, a turning stroke cuts the corner and comes up short.
    for (const stroke of even.points(0.5)) expect(length(stroke)).toBeLessThan(14.5);
  });

  it("is never spikier than the even morph, and far softer where shapes change most", () => {
    const sharpest = (points: Vec[][]) => Math.max(...points.map((p) => sharpestTurn(p, false)));
    for (const { from, to } of PAIRS) {
      const soft = morph(ICONS[from], ICONS[to], "soft");
      const even = morph(ICONS[from], ICONS[to], "even");
      for (const t of [0.3, 0.5, 0.7]) {
        expect(sharpest(soft.points(t))).toBeLessThanOrEqual(Math.max(sharpest(even.points(t)), 0.2) + 0.05);
      }
    }
    for (const [from, to] of [
      ["sun", "moon"],
      ["heart", "star"],
    ] as const) {
      const turn = (method: Method) => sharpest(morph(ICONS[from], ICONS[to], method).points(0.5));
      expect(turn("soft")).toBeLessThan(turn("even") / 2);
    }
  });

  it("turns only what's drawn out: a heart becomes a star upright, never spun", () => {
    const soft = morph(ICONS.heart, ICONS.star, "soft").points(0.5)[0];
    const even = morph(ICONS.heart, ICONS.star, "even").points(0.5)[0];
    // Neither turns it; soft only smooths, so its points stay close to even's outline.
    const apart = soft.reduce((sum, p) => sum + toPolyline(p, even), 0) / soft.length;
    expect(apart).toBeLessThan(0.6);
  });

  it("lets spare strokes shrink away to nothing", () => {
    const m = morph(ICONS.sun, ICONS.moon, "soft");
    expect(m.slots).toBe(9);
    const late = m.at(0.97);
    expect(late.filter((stroke) => stroke.width < 0.05)).toHaveLength(8);
  });
});

describe("steps", () => {
  const drawn = (way: Method | Steps, t: number) => morph(ICONS.heart, ICONS.star, way).at(t);

  it("are even with none of them and soft with all of them", () => {
    for (const t of [0.25, 0.5, 0.75]) {
      expect(drawn(EVENLY, t)).toEqual(drawn("even", t));
      expect(drawn(SOFTLY, t)).toEqual(drawn("soft", t));
    }
  });

  it("each draw the icons exactly at the ends, on their own", () => {
    for (const step of ["shape", "whole", "round", "curves"] as const) {
      const only = { ...EVENLY, [step]: true };
      expect(drawn(only, 0)).toEqual(drawn("soft", 0));
      expect(drawn(only, 1)).toEqual(drawn("soft", 1));
    }
  });

  it("whole: a chevron turns keeping its length; point by point, it's a third shorter halfway", () => {
    const whole = morph(ICONS["chevron-right"], ICONS["chevron-down"], SOFTLY);
    const pointwise = morph(ICONS["chevron-right"], ICONS["chevron-down"], { ...SOFTLY, whole: false });
    const start = length(whole.points(0.01)[0]);
    expect(length(whole.points(0.5)[0]) / start).toBeGreaterThan(0.94);
    expect(length(pointwise.points(0.5)[0]) / start).toBeLessThan(0.7);
  });

  it("round: a corner the second icon needs comes in rounded, not as a kink", () => {
    const rounded = morph(ICONS.minus, ICONS["chevron-down"], SOFTLY);
    const kinked = morph(ICONS.minus, ICONS["chevron-down"], { ...SOFTLY, round: false });
    for (const t of [0.2, 0.5]) {
      expect(sharpestTurn(rounded.points(t)[0], false)).toBeLessThan(sharpestTurn(kinked.points(t)[0], false) / 2);
    }
  });

  it("curves: the same morph through far fewer anchors than a polygon's points", () => {
    const curves = morph(ICONS.circle, ICONS.square, SOFTLY).shapes(0.5)[0];
    const polygon = morph(ICONS.circle, ICONS.square, { ...SOFTLY, curves: false }).shapes(0.5)[0];
    expect(polygon.nodes.every((node) => !node.in && !node.out)).toBe(true);
    expect(curves.nodes.length).toBeLessThan(polygon.nodes.length / 2);
  });
});

describe("startedAt", () => {
  it("starts where the shapes are most alike, and the opposite start is the least alike", () => {
    for (const [from, to] of [
      ["circle", "square"],
      ["heart", "star"],
    ] as const) {
      const residuals = Array.from({ length: 8 }, (_, k) => startedAt(ICONS[from], ICONS[to], k / 8).residual);
      expect(Math.min(...residuals)).toBe(residuals[0]);
      expect(residuals[0]).toBeLessThan(0.1);
      expect(residuals[4]).toBeGreaterThan(3);
      // Its own start is soft's morph.
      expect(startedAt(ICONS[from], ICONS[to], 0).morph.at(0.5)).toEqual(morph(ICONS[from], ICONS[to], "soft").at(0.5));
    }
  });
});

describe("soften", () => {
  it("leaves a straight line straight and its ends where they were", () => {
    const line: Vec[] = Array.from({ length: 30 }, (_, k) => [k, 2 * k]);
    const soft = soften(line, false, 3);
    expect(soft[0][0]).toBeCloseTo(0, 9);
    expect(soft[0][1]).toBeCloseTo(0, 9);
    expect(soft[29][0]).toBeCloseTo(29, 9);
    for (const [x, y] of soft) expect(y).toBeCloseTo(2 * x, 9);
  });

  it("rounds a square's corners without moving its sides", () => {
    const square: Vec[] = [];
    for (let k = 0; k < 40; k++) square.push([k * 0.5, 0]);
    for (let k = 0; k < 40; k++) square.push([20, k * 0.5]);
    for (let k = 0; k < 40; k++) square.push([20 - k * 0.5, 20]);
    for (let k = 0; k < 40; k++) square.push([0, 20 - k * 0.5]);
    const soft = soften(square, true, 1);
    expect(sharpestTurn(soft, true)).toBeLessThan(sharpestTurn(square, true) / 3);
    expect(soft[20][1]).toBeCloseTo(0, 6);
  });
});

describe("elongation", () => {
  it("is endless for a line and near 1 for round shapes", () => {
    expect(elongation([[0, 0], [1, 1], [2, 2]])).toBe(Infinity);
    const circle: Vec[] = Array.from({ length: 36 }, (_, k) => [Math.cos((k * Math.PI) / 18), Math.sin((k * Math.PI) / 18)]);
    expect(elongation(circle)).toBeCloseTo(1, 6);
  });
});

describe("shapes", () => {
  it("are what's drawn between the ends", () => {
    for (const method of METHODS)
      for (const pair of PAIRS) {
        const m = morph(ICONS[pair.from], ICONS[pair.to], method);
        for (const t of [0.2, 0.5, 0.8])
          expect(m.at(t).map((stroke) => stroke.d)).toEqual(m.shapes(t).map((shape) => nodesData(shape.nodes, shape.closed)));
      }
  });

  it("keep soft's anchors few, and the same ones all the way through", () => {
    for (const pair of PAIRS) {
      const m = morph(ICONS[pair.from], ICONS[pair.to], "soft");
      const counts = (t: number) => m.shapes(t).map((shape) => shape.nodes.length);
      // A star's ten rounded tips take about twenty, as Lucide's own path does; a bar takes two.
      for (const count of counts(0.5)) expect(count).toBeLessThanOrEqual(24);
      for (const t of [0, 0.1, 0.3, 0.7, 0.9, 1]) expect(counts(t)).toEqual(counts(0.5));
    }
  });

  it("follow soft's points closely", () => {
    for (const pair of PAIRS) {
      const m = morph(ICONS[pair.from], ICONS[pair.to], "soft");
      for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const shapes = m.shapes(t);
        m.points(t).forEach((points, k) => {
          // Every point lies near the drawn curve: sampled densely, its nearest sample is close.
          const samples = curveSamples(shapes[k].nodes, shapes[k].closed);
          for (const p of points) expect(Math.min(...samples.map((q) => distance(p, q)))).toBeLessThan(0.06);
        });
      }
    }
  });
});


describe("what it takes", () => {
  const at = (m: ReturnType<typeof morph>, t: number) => JSON.stringify(m.at(t));

  it("is soft unless told otherwise", () => {
    expect(at(morph(ICONS.plus, ICONS.x), 0.4)).toBe(at(morph(ICONS.plus, ICONS.x, "soft"), 0.4));
  });

  it("takes path data, one string or a list, as it takes elements", () => {
    const plus = ["M5 12h14", "M12 5v14"];
    expect(at(morph(plus, "M18 6 6 18m0-12 12 12"), 0.4)).toBe(at(morph(ICONS.plus, ["M18 6 6 18", "m6 6 12 12"]), 0.4));
    expect(at(morph("M5 12h14M12 5v14", ICONS.x), 0.6)).toBe(at(morph(ICONS.plus, ICONS.x), 0.6));
  });

  it("reads Lucide's icons as they come, other attributes and all", () => {
    // As lucide-react writes them, each element keyed.
    const keyed = ICONS.plus.map(([tag, attributes], k) => [tag, { ...attributes, key: `k${k}` }] as const);
    expect(at(morph(keyed, ICONS.x), 0.5)).toBe(at(morph(ICONS.plus, ICONS.x), 0.5));
  });
});

/** How far a point is from an open polyline. */
function toPolyline(p: Vec, line: Vec[]) {
  let nearest = Infinity;
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]];
    const along = [b[0] - a[0], b[1] - a[1]];
    const span = along[0] ** 2 + along[1] ** 2 || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * along[0] + (p[1] - a[1]) * along[1]) / span));
    nearest = Math.min(nearest, distance(p, [a[0] + u * along[0], a[1] + u * along[1]]));
  }
  return nearest;
}

/** Points along a shape's drawn curve, a hundredth of a unit apart or closer. */
function curveSamples(nodes: { at: Vec; in?: Vec; out?: Vec }[], closed: boolean): Vec[] {
  const out: Vec[] = [];
  const segments = closed ? nodes.length : nodes.length - 1;
  for (let k = 0; k < segments; k++) {
    const a = nodes[k];
    const b = nodes[(k + 1) % nodes.length];
    const c1 = a.out ?? a.at;
    const c2 = b.in ?? b.at;
    const steps = Math.ceil(distance(a.at, b.at) / 0.01) + 40;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const v = 1 - u;
      out.push([
        v ** 3 * a.at[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * b.at[0],
        v ** 3 * a.at[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * b.at[1],
      ]);
    }
  }
  return out.length ? out : nodes.map((node) => node.at);
}
