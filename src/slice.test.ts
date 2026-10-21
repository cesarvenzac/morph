import { describe, expect, it } from "vitest";

import { signedArea, type Vec } from "./geometry.ts";
import { keepBelow, partition } from "./slice.ts";

/** A rectangle's outline, its edges cut into steps of `step`, run clockwise on screen. */
function rectangle(x0: number, y0: number, x1: number, y1: number, step = 0.5): Vec[] {
  const points: Vec[] = [];
  const edge = (a: Vec, b: Vec) => {
    const count = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < count; k++) points.push([a[0] + ((b[0] - a[0]) * k) / count, a[1] + ((b[1] - a[1]) * k) / count]);
  };
  edge([x0, y0], [x1, y0]);
  edge([x1, y0], [x1, y1]);
  edge([x1, y1], [x0, y1]);
  edge([x0, y1], [x0, y0]);
  return points;
}

/** A U, open at the top: two arms 4 wide on a base 4 high, 20 across and 20 tall. */
const U: Vec[] = [
  [2, 2],
  [6, 2],
  [6, 18],
  [18, 18],
  [18, 2],
  [22, 2],
  [22, 22],
  [2, 22],
];

const area = (points: Vec[]) => Math.abs(signedArea(points));
const boxOf = (points: Vec[]) => [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))];

describe("keepBelow", () => {
  it("keeps the side of a line asked for", () => {
    const parts = keepBelow(rectangle(0, 0, 10, 10), [1, 0], 4)!;
    expect(parts).toHaveLength(1);
    expect(area(parts[0])).toBeCloseTo(40, 6);
    boxOf(parts[0]).forEach((value, k) => expect(value).toBeCloseTo([0, 0, 4, 10][k], 6));
    // Run the way the polygon runs.
    expect(Math.sign(signedArea(parts[0]))).toBe(Math.sign(signedArea(rectangle(0, 0, 10, 10))));
  });

  it("keeps all of a polygon on its side and none of one past it", () => {
    const square = rectangle(0, 0, 10, 10);
    expect(keepBelow(square, [1, 0], 12)).toEqual([square]);
    expect(keepBelow(square, [1, 0], -1)).toEqual([]);
  });

  it("parts a U cut across its arms into two, and keeps its base whole", () => {
    const arms = keepBelow(U, [0, 1], 10)!;
    expect(arms).toHaveLength(2);
    expect(arms.map(area)).toEqual([32, 32]);
    const base = keepBelow(U, [0, -1], -10)!;
    expect(base).toHaveLength(1);
    expect(area(base[0])).toBeCloseTo(area(U) - 64, 6);
  });
});

describe("partition", () => {
  it("cuts a square into quadrants for four sites at its corners", () => {
    const parts = partition(rectangle(0, 0, 20, 20), [[5, 5], [15, 5], [5, 15], [15, 15]], [0.25, 0.25, 0.25, 0.25], 0)!;
    expect(parts.map(boxOf).map((box) => box.map((v) => Math.round(v)))).toEqual([
      [0, 0, 10, 10],
      [10, 0, 20, 10],
      [0, 10, 10, 20],
      [10, 10, 20, 20],
    ]);
  });

  it("gives each part about its share of the area, whatever the sites' spacing", () => {
    const parts = partition(rectangle(0, 0, 30, 6), [[4, 3], [15, 3], [26, 3]], [0.5, 0.25, 0.25], 0)!;
    const whole = 30 * 6;
    expect(Math.abs(area(parts[0]) / whole - 0.5)).toBeLessThan(0.015);
    expect(Math.abs(area(parts[1]) / whole - 0.25)).toBeLessThan(0.015);
    expect(Math.abs(area(parts[2]) / whole - 0.25)).toBeLessThan(0.015);
  });

  it("lets each part reach a margin past its neighbours", () => {
    const [left, right] = partition(rectangle(0, 0, 20, 10), [[5, 5], [15, 5]], [0.5, 0.5], 0.1)!;
    expect(boxOf(left)[2]).toBeCloseTo(10.1, 6);
    expect(boxOf(right)[0]).toBeCloseTo(9.9, 6);
  });

  it("gives up when a part would come out in two", () => {
    // Above and below: the U's arms are both nearer the top site.
    expect(partition(U, [[12, 6], [12, 20]], [0.5, 0.5], 0)).toBeNull();
  });

  it("hands one site the whole polygon", () => {
    const square = rectangle(0, 0, 10, 10);
    expect(partition(square, [[3, 3]], [1], 0.1)).toEqual([square]);
  });
});
