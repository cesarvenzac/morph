import { describe, expect, it } from "vitest";

import { fromOklab, hexOf, mixColors, parseColor, toOklab, type RGBA } from "./color.ts";

const close = (actual: number[] | null, expected: number[], digits = 3) => {
  expect(actual).not.toBeNull();
  actual!.forEach((value, k) => expect(value).toBeCloseTo(expected[k], digits));
};

describe("parseColor", () => {
  it("reads hex, short and long, with or without alpha", () => {
    close(parseColor("#f00"), [1, 0, 0, 1]);
    close(parseColor("#ff000080"), [1, 0, 0, 128 / 255]);
    close(parseColor("#0f08"), [0, 1, 0, 0.5333]);
    close(parseColor("#3366CC"), [0.2, 0.4, 0.8, 1]);
  });

  it("reads rgb() and hsl() as CSS writes them, commas or spaces, alpha after a slash", () => {
    close(parseColor("rgb(255, 0, 0)"), [1, 0, 0, 1]);
    close(parseColor("rgba(0,0,255,0.5)"), [0, 0, 1, 0.5]);
    close(parseColor("rgb(100% 50% 0% / 25%)"), [1, 0.5, 0, 0.25]);
    close(parseColor("hsl(120deg 100% 50%)"), [0, 1, 0, 1]);
    close(parseColor("hsl(0.5turn, 100%, 25%)"), [0, 0.5, 0.5, 1]);
  });

  it("knows CSS's named colours, and refuses what it can't read", () => {
    close(parseColor("rebeccapurple"), [0.4, 0.2, 0.6, 1]);
    close(parseColor("Tomato"), [1, 99 / 255, 71 / 255, 1]);
    for (const value of ["currentColor", "var(--ink)", "oklch(70% 0.1 200)", "#12345", "rgb(1 2)", "blurple"]) expect(parseColor(value)).toBeNull();
  });
});

describe("OKLab", () => {
  it("goes there and back, to the precision of its matrices", () => {
    for (const rgba of [[1, 0, 0, 1], [0.2, 0.6, 0.4, 1], [0.95, 0.9, 0.1, 1]] as RGBA[]) close(fromOklab(toOklab(rgba)), rgba.slice(0, 3), 5);
  });
});

describe("mixColors", () => {
  it("is exactly either colour at its end, as written", () => {
    expect(mixColors("Red", "#00f", 0)).toBe("Red");
    expect(mixColors("Red", "#00f", 1)).toBe("#00f");
    expect(mixColors(undefined, "#00f", 0)).toBeUndefined();
    expect(mixColors("#111", "#111", 0.4)).toBe("#111");
  });

  it("mixes in OKLab: halfway is halfway in lightness and hue, not a muddy average", () => {
    const mixed = parseColor(mixColors("red", "blue", 0.5)!)!;
    const [L, a, b] = toOklab(mixed);
    const [Lr, ar, br] = toOklab([1, 0, 0, 1]);
    const [Lb, ab, bb] = toOklab([0, 0, 1, 1]);
    expect(L).toBeCloseTo((Lr + Lb) / 2, 2);
    expect(a).toBeCloseTo((ar + ab) / 2, 2);
    expect(b).toBeCloseTo((br + bb) / 2, 2);
    // Brighter than sRGB's own halfway purple (#800080).
    expect(mixed[0] + mixed[2]).toBeGreaterThan(2 * (128 / 255));
  });

  it("mixes alpha premultiplied: a see-through colour lends no hue", () => {
    expect(mixColors("rgba(255, 0, 0, 0)", "blue", 0.5)).toBe("#0000ff80");
  });

  it("leaves what it can't read to the browser's color-mix()", () => {
    expect(mixColors(undefined, "#e11d48", 0.25)).toBe("color-mix(in oklab, currentColor 75%, #e11d48)");
    expect(mixColors("var(--ink)", "blue", 0.5)).toBe("color-mix(in oklab, var(--ink) 50%, blue)");
  });

  it("writes hex", () => {
    expect(hexOf([1, 0.5, 0, 1])).toBe("#ff8000");
    expect(hexOf([0, 0, 0, 0.5])).toBe("#00000080");
  });
});
