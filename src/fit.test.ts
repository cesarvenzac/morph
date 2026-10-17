import { describe, expect, it } from "vitest";

import { chooseAnchors, fitSpan, nodesData, nodesThrough } from "./fit.ts";
import type { Vec } from "./geometry.ts";

const smooth = () => 1;

describe("fitSpan", () => {
  it("finds the cubic its points came from", () => {
    const [p0, c1, c2, p3]: Vec[] = [[0, 0], [2, 6], [8, 6], [10, 0]];
    const samples: Vec[] = Array.from({ length: 30 }, (_, k) => {
      const u = k / 29;
      const v = 1 - u;
      return [
        v ** 3 * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * p3[0],
        v ** 3 * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * p3[1],
      ];
    });
    const unit = (v: Vec): Vec => [v[0] / Math.hypot(...v), v[1] / Math.hypot(...v)];
    const fit = fitSpan(samples, unit([2, 6]), unit([2, -6]));
    expect(fit.error).toBeLessThan(0.05);
    expect(fit.c1[0]).toBeCloseTo(2, 0);
    expect(fit.c1[1]).toBeCloseTo(6, 0);
    expect(fit.c2[0]).toBeCloseTo(8, 0);
    expect(fit.c2[1]).toBeCloseTo(6, 0);
  });
});

describe("chooseAnchors", () => {
  it("needs only the ends of a straight line", () => {
    const line: Vec[] = Array.from({ length: 20 }, (_, k) => [k, 0]);
    const forced = line.map((_, k) => k === 0 || k === 19);
    expect(chooseAnchors([{ points: line, ease: smooth }], false, forced, 0.04)).toEqual([0, 19]);
  });

  it("keeps every corner, and draws a square as its sides", () => {
    const square: Vec[] = [];
    for (let k = 0; k < 10; k++) square.push([k, 0]);
    for (let k = 0; k < 10; k++) square.push([10, k]);
    for (let k = 0; k < 10; k++) square.push([10 - k, 10]);
    for (let k = 0; k < 10; k++) square.push([0, 10 - k]);
    const forced = square.map((_, k) => k % 10 === 0);
    const frame = { points: square, ease: (k: number) => (forced[k] ? 0 : 1) };
    const anchors = chooseAnchors([frame], true, forced, 0.04);
    expect(anchors).toEqual([0, 10, 20, 30]);
    expect(nodesData(nodesThrough(frame, true, anchors), true)).toMatch(/^M0 0C.*Z$/);
  });

  it("goes round a circle with a few anchors, never fewer than three", () => {
    const circle: Vec[] = Array.from({ length: 120 }, (_, k) => [10 * Math.cos((k * Math.PI) / 60), 10 * Math.sin((k * Math.PI) / 60)]);
    const anchors = chooseAnchors([{ points: circle, ease: smooth }], true, circle.map(() => false), 0.04);
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    expect(anchors.length).toBeLessThanOrEqual(8);
  });
});

describe("nodesData", () => {
  it("draws a line where neither side has a handle, a cubic otherwise", () => {
    expect(nodesData([{ at: [0, 0] }, { at: [10, 0] }], false)).toBe("M0 0L10 0");
    expect(nodesData([{ at: [0, 0], out: [3, 3] }, { at: [10, 0] }], false)).toBe("M0 0C3 3 10 0 10 0");
    expect(nodesData([], false)).toBe("");
  });
});
