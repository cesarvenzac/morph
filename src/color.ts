/**
 * Colours mixed as CSS mixes them: in OKLab, alpha premultiplied, so a red becoming a blue
 * passes through a clear purple, between the two in lightness, rather than a muddy one. Colours CSS can name
 * without a page (hex, `rgb()`, `hsl()`, the named colours) are mixed here into hex; anything
 * else (the current colour, a variable, a colour space this doesn't read) is left to the
 * browser as `color-mix()`.
 */

/** A colour as sRGB channels and alpha, each from 0 to 1. */
export type RGBA = [r: number, g: number, b: number, a: number];

/** CSS's named colours, as hex: `name` then its six digits, in one string to keep the package small. */
const NAMES =
  "aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000," +
  "blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00," +
  "chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b," +
  "darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b," +
  "darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a," +
  "darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1," +
  "darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff," +
  "firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700," +
  "goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4," +
  "indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00," +
  "lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3," +
  "lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa," +
  "lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32," +
  "linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3," +
  "mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc," +
  "mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead," +
  "navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6," +
  "palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9," +
  "peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f," +
  "royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d," +
  "silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f," +
  "steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3," +
  "white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32";

let named: Map<string, string> | null = null;
const namedHex = (name: string) => {
  named ??= new Map(NAMES.split(",").map((entry) => entry.split(":") as [string, string]));
  return named.get(name);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** A channel as written in `rgb()`: a number out of 255, or a percentage. */
const channel = (text: string) => (text.endsWith("%") ? parseFloat(text) / 100 : parseFloat(text) / 255);
/** An alpha as written: a number out of 1, or a percentage. */
const alpha = (text: string | undefined) => (text === undefined ? 1 : text.endsWith("%") ? parseFloat(text) / 100 : parseFloat(text));

/** A hue in degrees, from any of CSS's angle units. */
function hue(text: string) {
  const value = parseFloat(text);
  if (text.endsWith("turn")) return value * 360;
  if (text.endsWith("grad")) return value * 0.9;
  if (text.endsWith("rad")) return (value * 180) / Math.PI;
  return value;
}

/** The arguments of a colour function, comma- or space-separated, with an alpha after a slash. */
function args(inner: string): [string[], string | undefined] {
  const [main, slash] = inner.split("/");
  const parts = main.trim().split(/[\s,]+/).filter(Boolean);
  if (slash !== undefined) return [parts, slash.trim()];
  return parts.length === 4 ? [parts.slice(0, 3), parts[3]] : [parts, undefined];
}

/** A CSS colour as sRGB and alpha, or nothing when it isn't one this reads. */
export function parseColor(value: string): RGBA | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text) ? text.slice(1) : namedHex(text);
  if (hex !== undefined) {
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    const byte = (k: number) => parseInt(full.slice(2 * k, 2 * k + 2), 16) / 255;
    return [byte(0), byte(1), byte(2), full.length === 8 ? byte(3) : 1];
  }
  const call = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!call) return null;
  const [values, a] = args(call[2]);
  if (values.length !== 3) return null;
  let rgba: RGBA;
  if (call[1].startsWith("rgb")) {
    rgba = [channel(values[0]), channel(values[1]), channel(values[2]), alpha(a)];
  } else {
    const h = (((hue(values[0]) % 360) + 360) % 360) / 360;
    const s = clamp01(parseFloat(values[1]) / 100);
    const l = clamp01(parseFloat(values[2]) / 100);
    // CSS Color 4's hsl-to-rgb.
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    rgba = [f(0), f(8), f(4), alpha(a)];
  }
  return rgba.every(Number.isFinite) ? (rgba.map(clamp01) as RGBA) : null;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB into OKLab (Björn Ottosson's). */
export function toOklab([r, g, b]: RGBA): [L: number, a: number, b: number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab back into sRGB, clamped to what sRGB can show. */
export function fromOklab([L, A, B]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp01(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

const hexByte = (value: number) => Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");

/** A colour as `#rrggbb`, or `#rrggbbaa` when it's see-through. */
export function hexOf([r, g, b, a]: RGBA) {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${a < 1 ? hexByte(a) : ""}`;
}

const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`;

/**
 * The colour `t` of the way from `a` to `b` (each a CSS colour, or nothing for the current
 * colour), mixed in OKLab: exactly `a` at 0 and `b` at 1, hex between when both are colours
 * this reads, else `color-mix()` for the browser to mix.
 */
export function mixColors(a: string | undefined, b: string | undefined, t: number): string | undefined {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a === b) return a;
  const from = a === undefined ? null : parseColor(a);
  const to = b === undefined ? null : parseColor(b);
  if (!from || !to) return `color-mix(in oklab, ${a ?? "currentColor"} ${percent(1 - t)}, ${b ?? "currentColor"})`;
  // Premultiplied, as CSS mixes: a see-through colour lends its hue in proportion to how much of it shows.
  const alphaAt = from[3] + (to[3] - from[3]) * t;
  const [la, aa, ba] = toOklab(from).map((v) => v * from[3]);
  const [lb, ab, bb] = toOklab(to).map((v) => v * to[3]);
  const mixed = [la + (lb - la) * t, aa + (ab - aa) * t, ba + (bb - ba) * t].map((v) => (alphaAt > 1e-9 ? v / alphaAt : 0));
  return hexOf([...fromOklab(mixed as [number, number, number]), alphaAt]);
}
