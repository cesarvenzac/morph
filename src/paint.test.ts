import { describe, expect, it } from "vitest";

import { morph } from "./morph.ts";
import { attributesOf, svgOf } from "./paint.ts";
import { svg } from "./svg.ts";

describe("attributesOf", () => {
  it("draws an icon's part as a stroke in the current colour, as wide as its share says", () => {
    expect(attributesOf({ d: "M0 0L1 1", width: 0.5 })).toEqual({
      d: "M0 0L1 1",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    expect(attributesOf({ d: "M0 0", width: 1 }, { strokeWidth: 1.5 })["stroke-width"]).toBe("1.5");
  });

  it("draws a drawing's part in its own paint, every part with the same attributes", () => {
    expect(attributesOf({ d: "M0 0Z", width: 0, fill: 1, color: "#f00" })).toEqual({
      d: "M0 0Z",
      fill: "#f00",
      stroke: "none",
      "fill-opacity": "1",
      "fill-rule": "evenodd",
      "stroke-width": "0",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: "1",
    });
    expect(attributesOf({ d: "M0 0", width: 3, fill: 0, cap: "butt", join: "miter" })).toMatchObject({
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "3",
      "stroke-linecap": "butt",
      "stroke-linejoin": "miter",
    });
  });

  it("draws a stroke becoming a fill as both, the fill as far in as it is", () => {
    expect(attributesOf({ d: "M0 0", width: 1.25, fill: 0.4, color: "blue", opacity: 0.5 })).toMatchObject({
      fill: "blue",
      "fill-opacity": "0.4",
      stroke: "blue",
      "stroke-width": "1.25",
      opacity: "0.5",
    });
  });
});

describe("svgOf", () => {
  it("writes a frame as an SVG document on the morph's canvas", () => {
    const document = svgOf(morph("M5 12h14", "M12 5v14"), 0, { color: "#111", width: 48, height: 48 });
    expect(document).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" color="#111">` +
        `<path d="M5 12L19 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    );
  });

  it("leaves out empty parts and escapes what it writes", () => {
    const a = svg(`<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="url(#&quot;x&quot;)" color="a&quot;b"/><circle cx="7" cy="7" r="2"/></svg>`);
    const b = svg(`<svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg>`);
    const document = svgOf(morph(a, b, { extra: "gather" }), 1, { color: `"red"` });
    expect(document.match(/<path /g)).toHaveLength(1);
    expect(document).toContain(`color="&quot;red&quot;"`);
    // What SVG assumes anyway isn't written: a fill's stroke, full opacity.
    expect(document).toContain(`<path d="M0 0L4 0L4 4L0 4L0 0Z" fill="black" stroke="none" fill-rule="evenodd"/>`);
  });
});
