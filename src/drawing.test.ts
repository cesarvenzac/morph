import { describe, expect, it } from "vitest";

import { iconDrawing, isDrawing, islands, layoutOf, piecesOf } from "./drawing.ts";
import { parsePath } from "./geometry.ts";
import type { Drawing } from "./svg.ts";

/** A circle as path data, run clockwise or not. */
const circle = (cx: number, cy: number, r: number, clockwise = true) =>
  clockwise ? `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z` : `M${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}Z`;

const shapes = (d: string) => parsePath(d);

describe("islands", () => {
  it("makes a shape inside another a hole under evenodd, whichever way it runs", () => {
    expect(islands(shapes(circle(12, 12, 10) + circle(12, 12, 5)), "evenodd")).toEqual([{ outer: 0, holes: [1] }]);
  });

  it("under nonzero, makes it a hole only when it runs the other way", () => {
    expect(islands(shapes(circle(12, 12, 10) + circle(12, 12, 5, false)), "nonzero")).toEqual([{ outer: 0, holes: [1] }]);
    // The same way round, it's filled: an island of its own, drawn over the other.
    expect(islands(shapes(circle(12, 12, 10) + circle(12, 12, 5)), "nonzero")).toEqual([
      { outer: 0, holes: [] },
      { outer: 1, holes: [] },
    ]);
  });

  it("finds islands inside holes, and several holes in one, as an 8 or a B has", () => {
    const target = circle(12, 12, 11) + circle(12, 12, 8) + circle(12, 12, 5) + circle(12, 12, 2);
    expect(islands(shapes(target), "evenodd")).toEqual([
      { outer: 0, holes: [1] },
      { outer: 2, holes: [3] },
    ]);
    const eight = circle(12, 12, 11) + circle(12, 7, 3) + circle(12, 17, 3);
    expect(islands(shapes(eight), "evenodd")).toEqual([{ outer: 0, holes: [1, 2] }]);
  });

  it("keeps shapes that only overlap, or sit apart, as islands of their own", () => {
    expect(islands(shapes(circle(8, 12, 6) + circle(16, 12, 6)), "evenodd")).toEqual([
      { outer: 0, holes: [] },
      { outer: 1, holes: [] },
    ]);
  });

  it("passes over shapes with no area", () => {
    expect(islands(shapes(`M0 0L10 0L20 0Z${circle(12, 12, 4)}`), "nonzero")).toEqual([{ outer: 1, holes: [] }]);
  });
});

describe("layoutOf", () => {
  const box = (viewBox: [number, number, number, number], em?: number): Drawing => ({ parts: [], viewBox, em });

  it("leaves two drawings on the same canvas where they are, scaled to the grid", () => {
    expect(layoutOf(box([0, 0, 48, 48]), box([0, 0, 48, 48]))).toEqual({ viewBox: [0, 0, 48, 48], place: [null, null], scale: 0.5, digits: 3 });
  });

  it("fits the second into the first's canvas, centred, as a viewBox is fitted", () => {
    const layout = layoutOf(box([0, 0, 24, 24]), box([0, 0, 100, 50]));
    expect(layout.viewBox).toEqual([0, 0, 24, 24]);
    // 0.24 times as big, and moved down to the middle: (24 - 12) / 2.
    expect(layout.place[1]).toEqual([0.24, 0, 0, 0.24, 0, 6]);
  });

  it("takes two words set at a size as they are, centred on each other on a canvas wide enough for both", () => {
    const layout = layoutOf(box([0, -20, 40, 24], 24), box([0, -20, 80, 24], 24));
    expect(layout.place[1]).toEqual([1, 0, 0, 1, -20, 0]);
    expect(layout.viewBox).toEqual([-20, -20, 80, 24]);
    expect(layout.scale).toBe(1);
  });

  it("writes small canvases with more decimals", () => {
    expect(layoutOf(box([0, 0, 1, 1]), box([0, 0, 1, 1])).digits).toBe(5);
  });
});

describe("piecesOf", () => {
  it("makes each subpath of a stroke a piece, and keeps its paint", () => {
    const pieces = piecesOf({ parts: [{ kind: "stroke", d: "M0 0h10M0 5h10", width: 3, color: "red", cap: "butt" }], viewBox: [0, 0, 24, 24] }, null, 1, 3);
    expect(pieces.map((piece) => [piece.kind, piece.exact])).toEqual([
      ["stroke", "M0 0L10 0"],
      ["stroke", "M0 5L10 5"],
    ]);
    expect(pieces[0].paint).toEqual({ width: 3, fill: 0, opacity: 1, color: "red", cap: "butt", join: "round" });
  });

  it("closes a fill's shapes and puts each island's holes with it", () => {
    const [piece] = piecesOf({ parts: [{ kind: "fill", d: "M0 0H20V20H0M5 5H15V15H5Z", rule: "evenodd" }], viewBox: [0, 0, 24, 24] }, null, 1, 3);
    expect(piece.kind).toBe("fill");
    expect(piece.holes).toHaveLength(1);
    expect(piece.exact).toBe("M0 0L20 0L20 20L0 20L0 0ZM5 5L15 5L15 15L5 15L5 5Z");
    expect(piece.paint).toEqual({ width: 0, fill: 1, opacity: 1 });
  });

  it("puts a side where it's placed, scales its geometry to the grid and its strokes with the placement", () => {
    const [piece] = piecesOf({ parts: [{ kind: "stroke", d: "M0 0h10", width: 2 }], viewBox: [0, 0, 24, 24] }, [2, 0, 0, 2, 1, 1], 0.5, 3);
    expect(piece.exact).toBe("M1 1L21 1");
    expect(piece.path.start).toEqual([0.5, 0.5]);
    expect(piece.paint.width).toBe(4);
  });
});

describe("sources", () => {
  it("tells a drawing from an icon", () => {
    expect(isDrawing({ parts: [], viewBox: [0, 0, 24, 24] })).toBe(true);
    for (const icon of ["M0 0h1", ["M0 0h1"], [["path", { d: "M0 0h1" }]] as const]) expect(isDrawing(icon)).toBe(false);
  });

  it("draws an icon as Lucide does: strokes 2 wide with round ends on its 24-unit grid", () => {
    expect(iconDrawing([["circle", { cx: 12, cy: 12, r: 1 }]])).toMatchObject({ viewBox: [0, 0, 24, 24], parts: [{ kind: "stroke", width: 2, cap: "round", join: "round" }] });
  });
});
