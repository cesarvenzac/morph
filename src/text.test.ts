import { describe, expect, it } from "vitest";

import { text, type Font } from "./text.ts";

/**
 * A font as opentype.js reads one, made up: 1000 units to the em, two glyphs (an "o" with its hole,
 * an "l") and a space that draws nothing, each 500 units wide, set left to right on the baseline.
 */
function fakeFont(): Font & { asked: unknown[] } {
  const glyphs: Record<string, (x: number, k: number) => string> = {
    o: (x, k) => `M${x + 50 * k} ${-250 * k}A${200 * k} ${250 * k} 0 1 1 ${x + 450 * k} ${-250 * k}A${200 * k} ${250 * k} 0 1 1 ${x + 50 * k} ${-250 * k}Z` + `M${x + 150 * k} ${-250 * k}A${100 * k} ${150 * k} 0 1 0 ${x + 350 * k} ${-250 * k}A${100 * k} ${150 * k} 0 1 0 ${x + 150 * k} ${-250 * k}Z`,
    l: (x, k) => `M${x + 200 * k} 0V${-700 * k}H${x + 300 * k}V0Z`,
    " ": () => "",
  };
  const asked: unknown[] = [];
  const font = {
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    asked,
    getPaths(value: string, x: number, y: number, size: number) {
      asked.push(["getPaths", value, x, y, size]);
      const k = size / 1000;
      return [...value].map((char, i) => ({ toPathData: () => glyphs[char](x + i * 500 * k, k) }));
    },
    getPath(value: string, x: number, y: number, size: number) {
      asked.push(["getPath", value, x, y, size]);
      return { toPathData: () => font.getPaths(value, x, y, size).map((path) => path.toPathData()).join("") };
    },
    getAdvanceWidth: (value: string, size: number) => value.length * 500 * (size / 1000),
  };
  return font;
}

describe("text", () => {
  it("sets a word as a filled part a glyph, on the line's own canvas, its size as its em", () => {
    const font = fakeFont();
    const drawing = text(font, "lo l");
    expect(drawing.parts).toHaveLength(3);
    expect(drawing.parts.every((part) => part.kind === "fill" && part.rule === "nonzero" && part.color === undefined)).toBe(true);
    // 24 to the em: four advances of 12, from the ascender (19.2 above the baseline) to the descender.
    expect(drawing.viewBox).toEqual([0, -19.2, 48, 24]);
    expect(drawing.em).toBe(24);
    expect(font.asked[0]).toEqual(["getPaths", "lo l", 0, 0, 24]);
  });

  it("takes a size and a colour", () => {
    const drawing = text(fakeFont(), "o", { size: 100, color: "#e11d48" });
    expect(drawing.viewBox).toEqual([0, -80, 50, 100]);
    expect(drawing.parts[0].color).toBe("#e11d48");
  });

  it("makes do with getPath when a font has no getPaths", () => {
    const font = { ...fakeFont(), getPaths: undefined };
    expect(text(font, "ol").parts).toHaveLength(1);
  });
});

describe("text, where the font's shaping throws", () => {
  /** The made-up font, its shaping failing as opentype.js 2.0's does on Inter, its glyphs still there. */
  function failingFont() {
    const font = fakeFont();
    const glyph = (char: string) => ({ advanceWidth: 500, getPath: (x: number, _y: number, size: number) => ({ toPathData: () => (char === " " ? "" : font.getPaths!(char, x, 0, size)[0].toPathData()) }) });
    return {
      ...font,
      getPaths: () => {
        throw new Error("substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet supported");
      },
      getAdvanceWidth: () => {
        throw new Error("substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet supported");
      },
      charToGlyph: glyph,
      // "l" then "o" tucked in by 100 units.
      getKerningValue: (left: unknown, right: unknown) => (left && right ? -100 : 0),
    };
  }

  it("sets it glyph by glyph, with its kerning, on the same canvas", () => {
    const drawing = text(failingFont(), "lo l");
    expect(drawing.parts).toHaveLength(3);
    // Four advances of 12, less three kernings of 2.4.
    expect(drawing.viewBox[2]).toBeCloseTo(48 - 3 * 2.4, 6);
    expect(drawing.viewBox.slice(0, 2)).toEqual([0, -19.2]);
  });

  it("still throws when there's no way to set it glyph by glyph", () => {
    expect(() => text({ ...failingFont(), charToGlyph: undefined }, "lo")).toThrow(/not yet supported/);
  });
});

describe("text, with opentype.js", () => {
  /** A font opentype.js builds itself: real Glyph and Path objects, an "l" and an "o" with its hole. */
  async function builtFont() {
    const opentype = (await import("opentype.js")).default;
    const path = (draw: (p: InstanceType<typeof opentype.Path>) => void) => {
      const p = new opentype.Path();
      draw(p);
      return p;
    };
    const notdef = new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() });
    const l = new opentype.Glyph({
      name: "l",
      unicode: 108,
      advanceWidth: 500,
      path: path((p) => {
        p.moveTo(200, 0);
        p.lineTo(300, 0);
        p.lineTo(300, 700);
        p.lineTo(200, 700);
        p.close();
      }),
    });
    const o = new opentype.Glyph({
      name: "o",
      unicode: 111,
      advanceWidth: 500,
      path: path((p) => {
        p.moveTo(50, 250);
        p.curveTo(50, 600, 450, 600, 450, 250);
        p.curveTo(450, -100, 50, -100, 50, 250);
        p.close();
        p.moveTo(150, 250);
        p.curveTo(150, -20, 350, -20, 350, 250);
        p.curveTo(350, 520, 150, 520, 150, 250);
        p.close();
      }),
    });
    return new opentype.Font({ familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef, l, o] });
  }

  it("reads a word from a font it built, as shaped and glyph by glyph alike", async () => {
    const font = await builtFont();
    const shapedLine = text(font, "lo");
    expect(shapedLine.parts).toHaveLength(2);
    expect(shapedLine.viewBox).toEqual([0, -19.2, 24, 24]);
    // The same line set glyph by glyph, as when shaping throws: the same outlines where they were.
    const byGlyph = text(
      Object.assign(Object.create(font), {
        getPaths: () => {
          throw new Error("shaping failed");
        },
      }),
      "lo",
    );
    expect(byGlyph.viewBox).toEqual(shapedLine.viewBox);
    expect(byGlyph.parts.map((part) => part.d)).toEqual(shapedLine.parts.map((part) => part.d));
  });
});
