/**
 * Words as drawings, set in a font: each glyph a filled part, the canvas the line's own (its
 * advance, ascender to descender, the baseline at 0), and its size as `em`, so two words set at
 * one size are morphed as they're set rather than fitted to each other. The font is one
 * opentype.js has read, or anything shaped like it: the package reads no font files itself.
 */

import type { Drawing, DrawingPart } from "./svg.ts";

/** A glyph's outline, or a line's, as opentype.js gives one. */
type FontPath = { toPathData(decimals?: number): string };

/** A glyph as opentype.js gives one: what setting a line glyph by glyph needs of it. */
export type FontGlyph = { advanceWidth?: number; getPath(x: number, y: number, fontSize: number): FontPath };

/** A font as opentype.js reads one (`opentype.parse(buffer)`): what `text` uses of it. */
export type Font = {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  getPath(text: string, x: number, y: number, fontSize: number): FontPath;
  getPaths?(text: string, x: number, y: number, fontSize: number): FontPath[];
  getAdvanceWidth(text: string, fontSize: number): number;
  /**
   * A character's glyph and the kerning between two, for setting the line glyph by glyph where
   * `getPaths` throws: opentype.js 2.0 does on many fonts (Inter, DejaVu Serif) while it applies
   * their features.
   */
  charToGlyph?(char: string): FontGlyph;
  /** Given two glyphs `charToGlyph` returned: typed to take any glyphs, as opentype.js's does (a glyph or its index). */
  getKerningValue?(left: never, right: never): number;
};

export type TextOptions = {
  /** The size it's set at, in the drawing's units: 24 unless said, an icon's size. */
  size?: number;
  /** Any CSS colour. Left out, the current colour. */
  color?: string;
};

/** A line as the font shapes it: its glyphs' outlines and how far it advances. */
function shaped(font: Font, value: string, size: number) {
  const paths = font.getPaths ? font.getPaths(value, 0, 0, size) : [font.getPath(value, 0, 0, size)];
  return { paths, width: font.getAdvanceWidth(value, size) };
}

/** The kerning between two glyphs, in font units: none where the font has none to say (opentype.js throws on a font without a kerning table). */
function kerning(font: Font, left: FontGlyph, right: FontGlyph) {
  try {
    return font.getKerningValue?.(left as never, right as never) || 0;
  } catch {
    return 0;
  }
}

/** A line set glyph by glyph, each after the one before with their kerning: no ligatures, but no shaping to fail. */
function glyphByGlyph(font: Font & Required<Pick<Font, "charToGlyph">>, value: string, size: number) {
  const k = size / font.unitsPerEm;
  const paths: FontPath[] = [];
  let x = 0;
  let previous: FontGlyph | null = null;
  for (const char of value) {
    const glyph = font.charToGlyph(char);
    if (previous) x += kerning(font, previous, glyph) * k;
    paths.push(glyph.getPath(x, 0, size));
    x += (glyph.advanceWidth ?? 0) * k;
    previous = glyph;
  }
  return { paths, width: x };
}

/**
 * A word, or a line, set in `font` as a drawing to morph: `morph(text(font, "Hello"),
 * text(font, "World"))`. Its glyphs are filled parts, their holes found as SVG fills them. Set as
 * the font shapes it, or glyph by glyph where its shaping throws.
 */
export function text(font: Font, value: string, { size = 24, color }: TextOptions = {}): Drawing {
  let line: { paths: FontPath[]; width: number };
  try {
    line = shaped(font, value, size);
  } catch (error) {
    if (!font.charToGlyph) throw error;
    line = glyphByGlyph(font as Font & Required<Pick<Font, "charToGlyph">>, value, size);
  }
  const parts: DrawingPart[] = [];
  for (const path of line.paths) {
    const d = path.toPathData(3);
    if (!/[0-9]/.test(d)) continue;
    const part: DrawingPart = { kind: "fill", d, rule: "nonzero" };
    if (color !== undefined) part.color = color;
    parts.push(part);
  }
  const k = size / font.unitsPerEm;
  const { width } = line;
  return { parts, viewBox: [0, -font.ascender * k, width > 0 ? width : size, (font.ascender - font.descender) * k || size], em: size };
}
