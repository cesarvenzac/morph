// The package as someone installing it uses it: typechecked against its published types (as
// NodeNext and as a bundler resolves them) and run, by check/run.sh.
import opentype from "opentype.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  attributesOf,
  EVENLY,
  morph,
  motion,
  nodesData,
  svg,
  svgOf,
  text,
  type Drawing,
  type Font,
  type Icon,
  type Part,
  type Stroke,
} from "@cesarvenzac/morph";
import { draw, mount, type Mounted } from "@cesarvenzac/morph/dom";
import { MorphFrame, MorphIcon } from "@cesarvenzac/morph/react";

// Lucide's icons as its own types have them (lucide's IconNode: numbers allowed, keys too).
type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][];
const plus: IconNode = [
  ["path", { d: "M5 12h14", key: "a" }],
  ["path", { d: "M12 5v14", key: "b" }],
];
const circle: IconNode = [["circle", { cx: 12, cy: 12, r: 10 }]];
const x: Icon = ["M18 6 6 18", "m6 6 12 12"];

const halfway: Stroke[] = morph(plus, x).at(0.5);
const evenly = morph("M5 12h14", circle, "even").at(0.25);
const stepped = morph(plus, circle, { ...EVENLY, shape: true }).shapes(0.5);
const handles = stepped.map((shape) => nodesData(shape.nodes, shape.closed));

if (halfway.length !== 2 || !halfway.every((stroke) => stroke.d.startsWith("M"))) throw new Error("plus → x halfway isn't two strokes");
if (!evenly.length || !handles.every((d) => d.startsWith("M"))) throw new Error("a morph drew nothing");

// Any SVG: a red ring becoming a blue square, its hole closing, colours mixed.
const ring = svg(`<svg viewBox="0 0 48 48"><path fill="#e11d48" fill-rule="evenodd" d="M24 4a20 20 0 1 0 0 40a20 20 0 1 0 0-40zM24 14a10 10 0 1 1 0 20a10 10 0 1 1 0-20z"/></svg>`);
const square: Drawing = { parts: [{ kind: "fill", d: "M8 8h32v32H8z", color: "#2563eb" }], viewBox: [0, 0, 48, 48] };
const shapes = morph(ring, square, { extra: "split" });
const middle: Part[] = shapes.at(0.5);
if (middle[0].fill !== 1 || !middle[0].color?.startsWith("#")) throw new Error("a fill lost its paint");
if (attributesOf(middle[0])["fill-rule"] !== "evenodd") throw new Error("a fill isn't drawn even-odd");
if (!svgOf(shapes, 1).startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">`)) throw new Error("a frame isn't an SVG document");

// Words, in a font shaped as opentype.js reads one.
const font: Font = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  getPath: (value, left, baseline, size) => ({ toPathData: () => `M${left} ${baseline}h${(value.length * size) / 2}v${-size / 2}h${(-value.length * size) / 2}z` }),
  getAdvanceWidth: (value, size) => (value.length * size) / 2,
};
const words = morph(text(font, "Hi"), text(font, "Hello"));
if (words.viewBox[2] !== 60 || !words.at(0.5)[0].d.startsWith("M")) throw new Error("words weren't set on one canvas");

// And a font opentype.js itself built, its published types and all: it's a Font as it is.
const outline = new opentype.Path();
outline.moveTo(100, 0);
outline.lineTo(400, 0);
outline.lineTo(400, 700);
outline.lineTo(100, 700);
outline.close();
const built: Font = new opentype.Font({
  familyName: "Check",
  styleName: "Regular",
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: "I", unicode: 73, advanceWidth: 500, path: outline }),
  ],
});
if (text(built, "II").parts.length !== 2) throw new Error("opentype.js's own font set nothing");

// Played: a spring from plus to x, settling there.
let played = motion(plus).toward(x);
while (!played.settled) played = played.step(1 / 60);
if (played.frame().filter((part) => part.d).length !== 2) throw new Error("a motion didn't settle on x");

// In React, rendered as a server would.
const icon = renderToStaticMarkup(createElement(MorphIcon, { icon: plus, "aria-label": "Add", size: 32 }));
const frame = renderToStaticMarkup(createElement(MorphFrame, { morph: morph(plus, x), t: 0.5 }));
if (!icon.startsWith("<svg") || !icon.includes(`width="32"`) || !frame.includes("<path")) throw new Error("React drew nothing");

// In the page: typechecked only, as Node has no DOM.
const mounted: (element: Element) => Mounted = (element) => mount(element, plus);
const drawn: (element: Element) => void = (element) => draw(element, halfway, [0, 0, 24, 24]);
if (typeof mounted !== "function" || typeof drawn !== "function") throw new Error("the DOM entry isn't there");

console.log("ok", halfway.map((stroke) => stroke.d).join(" | "));
