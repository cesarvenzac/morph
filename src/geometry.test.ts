import { describe, expect, it } from "vitest";

import {
  arc,
  distance,
  elementPath,
  iconSubpaths,
  outline,
  outlineLength,
  parsePath,
  resample,
  subpathData,
  type Vec,
} from "./geometry.ts";

const radius = (p: Vec, c: Vec) => distance(p, c);

describe("parsePath", () => {
  it("reads Lucide's compact numbers, relative commands and arcs", () => {
    // The speaker's body from Volume 2: numbers run together (".705.705"), arcs, H and V.
    const [body] = parsePath(
      "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
    );
    expect(body.closed).toBe(true);
    expect(body.start).toEqual([11, 4.702]);
    const last = body.segments[body.segments.length - 1];
    expect(distance(last.to, body.start)).toBeLessThan(1e-9);
  });

  it("splits subpaths at every M, and repeats a command's numbers", () => {
    const paths = parsePath("M4 5h16M4 12h16 M4 19 L20 19 20 20");
    expect(paths).toHaveLength(3);
    expect(paths[2].segments.map((segment) => segment.to)).toEqual([
      [20, 19],
      [20, 20],
    ]);
  });

  it("turns S, Q and T into cubics through the right points", () => {
    const [path] = parsePath("M0 0Q10 0 10 10T20 20S30 30 40 40");
    expect(path.segments.every((segment) => segment.kind === "cubic")).toBe(true);
    expect(path.segments.map((segment) => segment.to)).toEqual([
      [10, 10],
      [20, 20],
      [40, 40],
    ]);
  });

  it("refuses what it can't read rather than guessing", () => {
    expect(() => parsePath("4 5h16")).toThrow();
    expect(() => parsePath("M0 0Z 4 4")).toThrow();
  });
});

describe("arc", () => {
  it("keeps every point on the circle", () => {
    const segments = arc([22, 12], [2, 12], 10, 10, 0, false, true);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    let from: Vec = [22, 12];
    for (const segment of segments) {
      if (segment.kind !== "cubic") throw new Error("expected cubics");
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1 - t;
        const p: Vec = [
          u * u * u * from[0] + 3 * u * u * t * segment.c1[0] + 3 * u * t * t * segment.c2[0] + t * t * t * segment.to[0],
          u * u * u * from[1] + 3 * u * u * t * segment.c1[1] + 3 * u * t * t * segment.c2[1] + t * t * t * segment.to[1],
        ];
        expect(Math.abs(radius(p, [12, 12]) - 10)).toBeLessThan(0.01);
      }
      from = segment.to;
    }
    expect(from).toEqual([2, 12]);
  });

  it("grows radii too small to span the chord", () => {
    const segments = arc([0, 0], [10, 0], 1, 1, 0, false, true);
    expect(segments[segments.length - 1].to).toEqual([10, 0]);
  });
});

describe("elements", () => {
  it("draws a circle as a closed loop of the right size", () => {
    const [circle] = iconSubpaths([["circle", { cx: "12", cy: "12", r: "10" }]]);
    const o = outline(circle);
    expect(o.closed).toBe(true);
    expect(o.corners.some(Boolean)).toBe(false);
    for (const p of o.points) expect(Math.abs(radius(p, [12, 12]) - 10)).toBeLessThan(0.01);
    expect(outlineLength(o)).toBeCloseTo(2 * Math.PI * 10, 1);
  });

  it("rounds a rect's corners smoothly, so it has none", () => {
    const [square] = iconSubpaths([["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }]]);
    expect(outline(square).corners.some(Boolean)).toBe(false);
    const [sharp] = iconSubpaths([["rect", { width: "18", height: "18", x: "3", y: "3" }]]);
    expect(outline(sharp).corners.filter(Boolean)).toHaveLength(4);
  });

  it("reads lines, polylines and polygons", () => {
    expect(elementPath(["line", { x1: "1", y1: "2", x2: "3", y2: "4" }])).toBe("M1 2L3 4");
    expect(parsePath(elementPath(["polygon", { points: "0,0 10,0 10,10" }]))[0].closed).toBe(true);
  });

  it("writes a subpath back exactly", () => {
    const [check] = parsePath("M20 6 9 17l-5-5");
    expect(subpathData(check)).toBe("M20 6L9 17L4 12");
  });
});

describe("outline", () => {
  it("marks a check's turn and its ends as corners, nothing else", () => {
    const o = outline(parsePath("M20 6 9 17l-5-5")[0]);
    const corners = o.points.filter((_, k) => o.corners[k]);
    expect(corners).toEqual([
      [20, 6],
      [9, 17],
      [4, 12],
    ]);
  });

  it("finds the star's five points and five inner turns among its curves", () => {
    const [star] = parsePath(
      "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
    );
    // Lucide rounds the star's points with small arcs, tangent to their edges: smooth, not corners.
    expect(outline(star).corners.filter(Boolean).length).toBe(0);
  });
});

describe("resample", () => {
  const check = outline(parsePath("M20 6 9 17l-5-5")[0]);

  it("gives exactly the count asked for, keeping the ends and the corner", () => {
    const r = resample(check, 40);
    expect(r.points).toHaveLength(40);
    expect(r.points[0]).toEqual([20, 6]);
    expect(r.points[39]).toEqual([4, 12]);
    expect(r.points.some((p) => distance(p, [9, 17]) < 1e-9)).toBe(true);
  });

  it("spaces points evenly within each stretch", () => {
    const r = resample(check, 40);
    const gaps = r.points.slice(1).map((p, k) => distance(p, r.points[k]));
    const longest = Math.max(...gaps);
    const shortest = Math.min(...gaps);
    expect(longest / shortest).toBeLessThan(1.25);
  });

  it("keeps a resampled circle round", () => {
    const [circle] = iconSubpaths([["circle", { cx: "12", cy: "12", r: "4" }]]);
    const r = resample(outline(circle), 48);
    expect(r.points).toHaveLength(48);
    for (const p of r.points) expect(Math.abs(radius(p, [12, 12]) - 4)).toBeLessThan(0.01);
  });

  it("refuses too few points to keep every corner", () => {
    expect(() => resample(check, 2)).toThrow();
  });
});
