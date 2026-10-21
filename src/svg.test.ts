import { describe, expect, it } from "vitest";

import { parsePath } from "./geometry.ts";
import { boxAround, parseTransform, svg, transformSubpath } from "./svg.ts";

const near = (actual: number[], expected: number[]) => actual.forEach((value, k) => expect(value).toBeCloseTo(expected[k], 6));

describe("svg", () => {
  it("reads a stroked icon as Lucide writes it: strokes in the current colour, the group's width", () => {
    const drawing = svg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    );
    expect(drawing.viewBox).toEqual([0, 0, 24, 24]);
    expect(drawing.parts).toEqual([
      { kind: "stroke", d: "M5 12L19 12", width: 2, cap: "round", join: "round" },
      { kind: "stroke", d: "M12 5L12 19", width: 2, cap: "round", join: "round" },
    ]);
  });

  it("fills in black and strokes nothing unless told otherwise, as SVG does", () => {
    const drawing = svg(`<svg viewBox="0 0 10 10"><rect width="4" height="4"/><line x1="0" y1="0" x2="5" y2="5"/></svg>`);
    // The line has no area to fill and no stroke: nothing of it is drawn.
    expect(drawing.parts).toEqual([{ kind: "fill", d: "M0 0L4 0L4 4L0 4L0 0Z", rule: "nonzero", color: "black" }]);
  });

  it("makes a fill and a stroke of a shape that has both, each with its own paint", () => {
    const drawing = svg(`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#ff0000" stroke="blue" stroke-width="0.5" fill-opacity="0.5"/></svg>`);
    expect(drawing.parts.map(({ kind, color, opacity, width }) => ({ kind, color, opacity, width }))).toEqual([
      { kind: "fill", color: "#ff0000", opacity: 0.5, width: undefined },
      { kind: "stroke", color: "blue", opacity: undefined, width: 0.5 },
    ]);
  });

  it("lets the style attribute win over presentation attributes, and groups pass paint down", () => {
    const drawing = svg(
      `<svg viewBox="0 0 10 10"><g fill="none" stroke="green" style="stroke-width: 3"><path d="M0 0L5 5" stroke="red" style="stroke: orange !important"/></g></svg>`,
    );
    // SVG's own caps and joins, since nothing set them.
    expect(drawing.parts).toEqual([{ kind: "stroke", d: "M0 0L5 5", width: 3, color: "orange", cap: "butt", join: "miter" }]);
  });

  it("bakes nested transforms into the path data, stroke widths scaled with them", () => {
    const drawing = svg(
      `<svg viewBox="0 0 100 100"><g transform="translate(10 20)"><path d="M0 0L10 0" transform="scale(2)" fill="none" stroke="black" stroke-width="1"/></g></svg>`,
    );
    expect(drawing.parts[0].d).toBe("M10 20L30 20");
    expect(drawing.parts[0].width).toBeCloseTo(2, 9);
  });

  it("resolves currentColor to the colour a group above sets, and gradients to the current colour", () => {
    const drawing = svg(`<svg viewBox="0 0 10 10"><g color="purple"><rect width="2" height="2" fill="currentColor"/></g><rect width="2" height="2" fill="url(#g)"/></svg>`);
    expect(drawing.parts.map((part) => part.color)).toEqual(["purple", undefined]);
  });

  it("passes over what isn't drawn: defs, clips, hidden elements, text, comments", () => {
    const drawing = svg(
      `<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 10 10"><!-- a <path d="M0 0"/> in a comment --><defs><path id="p" d="M0 0L1 1"/></defs>` +
        `<clipPath id="c"><rect width="5" height="5"/></clipPath><text x="0" y="5">Hi</text><g display="none"><rect width="1" height="1"/></g>` +
        `<rect width="1" height="1" visibility="hidden"/><rect x="5" y="5" width="1" height="1"/></svg>`,
    );
    expect(drawing.parts).toHaveLength(1);
    expect(drawing.parts[0].d).toBe("M5 5L6 5L6 6L5 6L5 5Z");
  });

  it("keeps a fill's rule", () => {
    const drawing = svg(`<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2 2h20v20H2zM6 6v12h12V6z"/></svg>`);
    expect(drawing.parts[0]).toMatchObject({ kind: "fill", rule: "evenodd" });
    expect(drawing.parts[0].color).toBeUndefined();
  });

  it("finds its canvas in the viewBox, else its width and height, else what it draws", () => {
    expect(svg(`<svg width="32" height="16"><rect width="1" height="1"/></svg>`).viewBox).toEqual([0, 0, 32, 16]);
    expect(svg(`<svg><rect x="2" y="3" width="4" height="5"/></svg>`).viewBox).toEqual([2, 3, 4, 5]);
  });

  it("reads entities, single quotes and namespaced names", () => {
    const drawing = svg(`<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox='0 0 10 10'><svg:path d='M0 0&#x4C;5 5' fill='none' stroke='black'/></svg:svg>`);
    expect(drawing.parts[0].d).toBe("M0 0L5 5");
  });

  it("refuses markup with no svg in it", () => {
    expect(() => svg("<div></div>")).toThrow(/No <svg>/);
  });
});

describe("transforms", () => {
  it("compose as SVG does, the last applied first", () => {
    const m = parseTransform("translate(10 0) scale(2)");
    const [path] = parsePath("M1 1L2 2").map((p) => transformSubpath(p, m));
    near(path.start, [12, 2]);
    expect(path.segments[0]).toEqual({ kind: "line", to: [14, 4] });
  });

  it("rotate round a centre, and skew", () => {
    const m = parseTransform("rotate(90 5 5)");
    const [path] = parsePath("M10 5L5 5").map((p) => transformSubpath(p, m));
    near(path.start, [5, 10]);
    const skew = parseTransform("skewX(45)");
    const [skewed] = parsePath("M0 10L0 0").map((p) => transformSubpath(p, skew));
    near(skewed.start, [10, 10]);
  });

  it("refuse what they don't know", () => {
    expect(() => parseTransform("perspective(2)")).toThrow(/Unknown transform/);
  });
});

describe("boxAround", () => {
  it("is the smallest box round the points, never empty", () => {
    expect(boxAround([[1, 2], [5, -1], [3, 3]])).toEqual([1, -1, 4, 4]);
    expect(boxAround([[2, 2]])).toEqual([2, 2, 1, 1]);
    expect(boxAround([])).toBeNull();
  });
});
