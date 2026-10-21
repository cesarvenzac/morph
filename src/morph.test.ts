import { describe, expect, it } from "vitest";

import { distance, iconSubpaths, subpathData, type Vec } from "./geometry.ts";
import { ICONS, PAIRS } from "./icons.fixture.ts";
import { nodesData } from "./fit.ts";
import { mixColors } from "./color.ts";
import { iconDrawing, isDrawing, layoutOf, piecesOf } from "./drawing.ts";
import { assign, elongation, EVENLY, morph, sharpestTurn, SOFTLY, soften, startedAt, type Method, type Steps } from "./morph.ts";
import { svg, type Drawing } from "./svg.ts";

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
          expect(Math.max(0, ...points.map((p) => nearestOf(p, samples)))).toBeLessThan(0.06);
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

/** How far a point is from the nearest of some samples (a plain loop: this runs a few million times). */
function nearestOf(p: Vec, samples: readonly Vec[]) {
  let least = Infinity;
  for (const q of samples) least = Math.min(least, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
  return Math.sqrt(least);
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

describe("drawings", () => {
  const solid = (inner: string, viewBox = "0 0 24 24") => svg(`<svg viewBox="${viewBox}">${inner}</svg>`);
  const disc = solid(`<circle cx="12" cy="12" r="9" fill="#e11d48"/>`);
  const ring = solid(`<path fill="#2563eb" fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"/>`);
  const triangle = solid(`<path d="M6 4L20 12L6 20Z"/>`);
  const bars = solid(`<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>`);
  const dots = solid(`<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>`);
  const bar = solid(`<rect x="3" y="10" width="18" height="4" rx="2"/>`);
  const logo = solid(`<rect x="2" y="2" width="9" height="9" fill="tomato"/><circle cx="17" cy="17" r="4" fill="none" stroke="navy" stroke-width="2"/>`);
  const PAIRS = [
    [disc, ring],
    [ring, triangle],
    [triangle, bars],
    [dots, bar],
    [logo, ring],
    [ICONS.heart, ring],
  ] as const;
  const subpaths = (d: string) => d.match(/M/g)?.length ?? 0;

  it("draws both sides exactly at the ends, with their paint, every way", () => {
    for (const method of METHODS) {
      for (const [from, to] of PAIRS) {
        const m = morph(from, to, method);
        const a = isDrawing(from) ? from : iconDrawing(from);
        const b = isDrawing(to) ? to : iconDrawing(to);
        const { place, scale, digits } = layoutOf(a, b);
        const exact = (drawing: typeof a, at: (typeof place)[number]) => piecesOf(drawing, at, scale, digits).map((piece) => piece.exact).sort();
        const drawn = (t: number) =>
          m
            .at(t)
            .map((part) => part.d)
            .filter(Boolean)
            .sort();
        expect(drawn(0)).toEqual(exact(a, place[0]));
        expect(drawn(1)).toEqual(exact(b, place[1]));
        for (const t of [0.2, 0.5, 0.8]) for (const part of m.at(t)) expect(part.d).not.toMatch(/NaN|Infinity/);
      }
    }
    const colours = (t: number) => morph(logo, ring).at(t).filter((part) => part.d).map((part) => part.color);
    expect(colours(0).sort()).toEqual(["navy", "tomato"]);
    expect(colours(1)).toEqual(["#2563eb"]);
  });

  it("opens a hole as a disc becomes a ring, from a point, and closes it again", () => {
    const opening = morph(disc, ring);
    expect(subpaths(opening.at(0)[0].d)).toBe(1);
    expect(subpaths(opening.at(0.5)[0].d)).toBe(2);
    const shape = opening.shapes(0.5)[0];
    expect(shape.holes).toHaveLength(1);
    // The hole is small at first, and inside its island all the way.
    const radius = (t: number) => {
      const hole = opening.shapes(t)[0].holes![0].nodes.map((node) => node.at);
      return Math.max(...hole.map(([x, y]) => Math.hypot(x - 12, y - 12)));
    };
    expect(radius(0.1)).toBeLessThan(radius(0.5));
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) expect(radius(t)).toBeLessThan(9);
    expect(subpaths(morph(ring, disc).at(1)[0].d)).toBe(1);
  });

  it("moves an island's holes with it", () => {
    const left = solid(`<path fill-rule="evenodd" d="M2 7h10v10H2zM5 10h4v4H5z"/>`);
    const right = solid(`<path fill-rule="evenodd" d="M12 7h10v10H12zM15 10h4v4h-4z"/>`);
    const m = morph(left, right);
    for (const t of [0.25, 0.5, 0.75]) {
      const [outer] = m.points(t);
      const xs = outer.map(([x]) => x);
      const hole = m.shapes(t)[0].holes![0].nodes.map((node) => node.at[0]);
      expect(Math.min(...hole)).toBeGreaterThan(Math.min(...xs));
      expect(Math.max(...hole)).toBeLessThan(Math.max(...xs));
    }
  });

  it("crossfades a stroke into a fill: the fill comes in as the stroke narrows", () => {
    const m = morph(ICONS.heart, svg(`<svg viewBox="0 0 24 24"><path fill="#e11d48" d="M12 21l-8-8a5 5 0 0 1 8-6a5 5 0 0 1 8 6z"/></svg>`));
    const parts = [0, 0.25, 0.5, 0.75, 1].map((t) => m.at(t)[0]);
    expect(parts.map((part) => part.fill)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(parts.map((part) => part.width)).toEqual([2, 1.5, 1, 0.5, 0]);
    expect(parts[2].color).toBe("color-mix(in oklab, currentColor 50%, #e11d48)");
  });

  it("mixes colours in OKLab, and keeps a stroke's ends from the nearer side", () => {
    const red = solid(`<path d="M2 12h20" stroke="red" stroke-width="2" stroke-linecap="butt"/>`);
    const blue = solid(`<path d="M12 2v20" stroke="blue" stroke-width="4"/>`);
    const m = morph(red, blue);
    expect(m.at(0.5)[0]).toMatchObject({ color: mixColors("red", "blue", 0.5), width: 3, fill: 0, join: "miter" });
    expect(m.at(0.25)[0].cap).toBe("butt");
    expect(m.at(0.75)[0].cap).toBe("butt");
    const round = morph(red, solid(`<path d="M12 2v20" stroke="blue" stroke-width="4" stroke-linecap="round"/>`));
    expect([round.at(0.4)[0].cap, round.at(0.6)[0].cap]).toEqual(["butt", "round"]);
  });

  it("draws on the first side's canvas, the second fitted into it", () => {
    const big = svg(`<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32"/></svg>`);
    const m = morph(disc, big);
    expect(m.viewBox).toEqual([0, 0, 24, 24]);
    expect(m.at(1)[0].d).toBe("M4 4L20 4L20 20L4 20L4 4Z");
  });

  it("sets two words at one size on a canvas wide enough for both, centred on each other", () => {
    const word = (width: number): Drawing => ({ parts: [{ kind: "fill", d: `M0 -10h${width}v10h-${width}z` }], viewBox: [0, -18, width, 24], em: 24 });
    const m = morph(word(10), word(30));
    // The first stays where it is; the second is centred on it.
    expect(m.viewBox).toEqual([-10, -18, 30, 24]);
    expect(m.at(0)[0].d).toBe("M0 -10L10 -10L10 0L0 0L0 -10Z");
    expect(m.at(1)[0].d).toBe("M-10 -10L20 -10L20 0L-10 0L-10 -10Z");
  });

  it("keeps an icon morph's parts as they were: path data and a width", () => {
    for (const part of morph(ICONS.plus, ICONS.x).at(0.5)) expect(Object.keys(part).sort()).toEqual(["d", "width"]);
    expect(morph(ICONS.plus, ICONS.x).viewBox).toEqual([0, 0, 24, 24]);
  });
});

describe("extra pieces", () => {
  const ellipsis = [["circle", { cx: "12", cy: "12", r: "1" }], ["circle", { cx: "19", cy: "12", r: "1" }], ["circle", { cx: "5", cy: "12", r: "1" }]] as const;

  it("gather into dots, as before, when told to", () => {
    const m = morph(ellipsis, ICONS.minus, { extra: "gather" });
    expect(m.slots).toBe(3);
    expect(m.at(0.97).filter((part) => part.width < 0.05)).toHaveLength(2);
  });

  it("join a line when they're dots along it (auto): each becomes a stretch of it, none shrinks away", () => {
    const m = morph(ellipsis, ICONS.minus);
    expect(m.slots).toBe(3);
    const late = m.at(0.97);
    expect(late.filter((part) => part.width > 0.99)).toHaveLength(3);
    // Their points cover the line from end to end.
    const xs = m.points(0.999).flat().map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(5, 1);
    expect(Math.max(...xs)).toBeCloseTo(19, 1);
    expect(m.at(1).filter((part) => part.d)).toEqual([{ d: "M5 12L19 12", width: 1 }]);
    // And the other way, a line breaks into dots.
    expect(morph(ICONS.minus, ellipsis).at(0.03).filter((part) => part.width > 0.99)).toHaveLength(3);
  });

  it("leave big pieces alone under auto: a menu's bars gather rather than bend into a circle", () => {
    expect(morph(ICONS.menu, ICONS.circle).at(0.97).filter((part) => part.width < 0.05)).toHaveLength(2);
  });

  it("split one piece into several when told to: a circle shared out between a menu's bars", () => {
    const m = morph(ICONS.menu, ICONS.circle, { extra: "split" });
    expect(m.slots).toBe(3);
    const late = m.at(0.999);
    expect(late.every((part) => part.d && part.width > 0.99)).toBe(true);
    for (const [x, y] of m.points(0.999).flat()) expect(Math.hypot(x - 12, y - 12)).toBeCloseTo(10, 0);
    expect(m.at(1).filter((part) => part.d)).toHaveLength(1);
  });

  it("cut a fill into a part for each piece that joins it: dots become stretches of a bar, none fading", () => {
    const dots = svg(`<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`);
    const bar = svg(`<svg viewBox="0 0 24 24"><rect x="3" y="10" width="18" height="4" rx="2"/></svg>`);
    const m = morph(dots, bar);
    expect(m.slots).toBe(3);
    expect(m.at(0.95).every((part) => part.d && part.opacity === undefined)).toBe(true);
    // Each ends as a third of the bar, left to right, and together they cover it.
    const boxes = m.points(0.999).map((points) => [Math.min(...points.map(([x]) => x)), Math.max(...points.map(([x]) => x))]);
    boxes.sort((a, b) => a[0] - b[0]);
    expect(boxes[0][0]).toBeCloseTo(3, 1);
    expect(boxes[2][1]).toBeCloseTo(21, 1);
    expect(boxes[0][1]).toBeGreaterThanOrEqual(boxes[1][0]);
    expect(boxes[1][1]).toBeGreaterThanOrEqual(boxes[2][0]);
    expect(m.at(1).filter((part) => part.d)).toHaveLength(1);
    // And the other way, the bar is cut in three as it breaks into dots.
    expect(morph(bar, dots).at(0.05).every((part) => part.d && part.opacity === undefined)).toBe(true);
  });

  it("make pieces that join a fill with holes each become the whole of it, the copies past the first fading", () => {
    const dots = svg(`<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/></svg>`);
    const ring = svg(`<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18Zm0 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 1 1 0-9Z"/></svg>`);
    const late = morph(dots, ring, { extra: "split" }).at(0.95);
    expect(late.filter((part) => part.opacity === undefined)).toHaveLength(1);
    expect(late.filter((part) => (part.opacity ?? 1) < 0.1)).toHaveLength(1);
  });

  it("part a stroke from a fill when splitting and either has one of its kind to join: two squares merge into a sun's disc as its rays grow", () => {
    const squares = svg(`<svg viewBox="0 0 24 24"><rect x="4" y="8" width="7" height="7"/><rect x="13" y="8" width="7" height="7"/></svg>`);
    const sun = svg(
      `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path fill="none" stroke="currentColor" stroke-width="2" d="M12 4V2M20 12h2M12 20v2M4 12H2"/></svg>`,
    );
    const split = morph(squares, sun, { extra: "split" });
    expect(split.slots).toBe(6);
    // Nothing crossfades between a stroke and a fill: each part is one or the other all along.
    expect(split.at(0.5).every((part) => part.fill === 0 || part.fill === 1)).toBe(true);
    expect(split.at(0.5).filter((part) => part.fill === 1)).toHaveLength(2);
    // Under auto, a square still crossfades into a ray.
    expect(morph(squares, sun).at(0.5).some((part) => part.fill !== undefined && part.fill > 0 && part.fill < 1)).toBe(true);
  });

  it("crossfade a stroke into a fill when neither has one of its kind to join", () => {
    const outline = svg(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>`);
    const disc = svg(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>`);
    const [part] = morph(outline, disc, { extra: "split" }).at(0.5);
    expect(part.fill).toBeCloseTo(0.5, 5);
  });
});

describe("options", () => {
  const at = (m: ReturnType<typeof morph>, t: number) => JSON.stringify(m.at(t));

  it("take the way as an option or on its own", () => {
    expect(at(morph(ICONS.heart, ICONS.star, { way: "even" }), 0.5)).toBe(at(morph(ICONS.heart, ICONS.star, "even"), 0.5));
    expect(at(morph(ICONS.heart, ICONS.star, { way: { ...EVENLY, shape: true } }), 0.5)).toBe(at(morph(ICONS.heart, ICONS.star, { ...EVENLY, shape: true }), 0.5));
    expect(at(morph(ICONS.heart, ICONS.star, {}), 0.5)).toBe(at(morph(ICONS.heart, ICONS.star), 0.5));
  });
});

describe("assign", () => {
  it("finds the cheapest way to give each row its own column", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 10;
    for (let trial = 0; trial < 30; trial++) {
      const rows = 1 + (trial % 4);
      const columns = rows + (trial % 3);
      const cost = Array.from({ length: rows }, () => Array.from({ length: columns }, random));
      const picked = assign(cost);
      expect(new Set(picked).size).toBe(rows);
      const total = (pick: number[]) => pick.reduce((sum, column, row) => sum + cost[row][column], 0);
      // Every way, by brute force.
      let best = Infinity;
      const walk = (pick: number[]) => {
        if (pick.length === rows) best = Math.min(best, total(pick));
        else for (let c = 0; c < columns; c++) if (!pick.includes(c)) walk([...pick, c]);
      };
      walk([]);
      expect(total(picked)).toBeCloseTo(best, 9);
    }
  });
});
