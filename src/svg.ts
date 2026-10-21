/**
 * SVG markup read without a DOM, so it runs anywhere: the drawable elements of a document with
 * their transforms baked in, each fill and each stroke a part of its own with the paint it's
 * drawn in, and the canvas they sit on. What a morph needs and no more: gradients and patterns
 * read as the current colour, and what can't be drawn as a path (text, images, clips, masks,
 * filters, references) is passed over.
 */

import { elementPath, parsePath, subpathData, type Subpath, type Vec } from "./geometry.ts";

/** A canvas: where it starts, and how wide and tall it is. */
export type Box = [x: number, y: number, width: number, height: number];

/** A part of a drawing: one shape, filled or stroked, as path data, and the paint it's drawn in. */
export type DrawingPart = {
  kind: "fill" | "stroke";
  /** SVG path data, in the drawing's units. */
  d: string;
  /** Any CSS colour, as written. Left out, the part is drawn in the current colour. */
  color?: string;
  /** From 0 to 1; 1 if left out. */
  opacity?: number;
  /** A stroke's width, in the drawing's units. */
  width?: number;
  /** How a fill fills where its shapes overlap: `nonzero` (SVG's default) or `evenodd`. */
  rule?: "nonzero" | "evenodd";
  /** A stroke's ends and corners, as SVG names them. Left out, round. */
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
};

/** Parts on a canvas: what `morph` takes besides icons, from `svg`, `text` or made by hand. */
export type Drawing = {
  parts: DrawingPart[];
  viewBox: Box;
  /**
   * A text's size. Two drawings that both have one are taken as they are (only centred on each
   * other), as two words set in a font should be; others are fitted to one another.
   */
  em?: number;
};

/** An affine transform as SVG writes one: `matrix(a b c d e f)`. */
export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const apply = (m: Matrix, [x, y]: Vec): Vec => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** A transform list (`translate(…) rotate(…)`, applied right to left as SVG does) as one matrix. */
export function parseTransform(value: string): Matrix {
  let matrix = IDENTITY;
  const call = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (let match = call.exec(value); match; match = call.exec(value)) {
    const name = match[1];
    const n = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    let next: Matrix;
    switch (name) {
      case "matrix":
        if (n.length < 6) throw new Error(`matrix() takes six numbers: "${value}"`);
        next = [n[0], n[1], n[2], n[3], n[4], n[5]];
        break;
      case "translate":
        next = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case "scale":
        next = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const a = radians(n[0] ?? 0);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
        next = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case "skewX":
        next = [1, 0, Math.tan(radians(n[0] ?? 0)), 1, 0, 0];
        break;
      case "skewY":
        next = [1, Math.tan(radians(n[0] ?? 0)), 0, 1, 0, 0];
        break;
      default:
        throw new Error(`Unknown transform "${name}"`);
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
}

/** A subpath moved by a matrix: an affine map keeps lines lines and cubics cubics. */
export function transformSubpath(path: Subpath, m: Matrix): Subpath {
  return {
    start: apply(m, path.start),
    closed: path.closed,
    segments: path.segments.map((segment) =>
      segment.kind === "line" ? { kind: "line", to: apply(m, segment.to) } : { kind: "cubic", c1: apply(m, segment.c1), c2: apply(m, segment.c2), to: apply(m, segment.to) },
    ),
  };
}

/* ----------------------------------------------------------------------------
 * Reading markup
 * ------------------------------------------------------------------------- */

type Tag = { name: string; attributes: Record<string, string>; closing: boolean; empty: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name[0] === "#") return String.fromCodePoint(name[1] === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });

/** A local name: `svg:path` is a `path`, `xlink:href` an `href`. */
const local = (name: string) => name.slice(name.indexOf(":") + 1);

/** The tags of a document in order, comments, declarations and text passed over. */
function* tags(markup: string): Generator<Tag> {
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (let match = token.exec(markup); match; match = token.exec(markup)) {
    if (match[1]) {
      yield { name: local(match[1]), attributes: {}, closing: true, empty: false };
      continue;
    }
    if (!match[2]) continue;
    let rest = match[3];
    const empty = /\/\s*$/.test(rest);
    if (empty) rest = rest.replace(/\/\s*$/, "");
    const attributes: Record<string, string> = {};
    const attribute = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    for (let a = attribute.exec(rest); a; a = attribute.exec(rest)) {
      attributes[local(a[1])] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    }
    yield { name: local(match[2]), attributes, closing: false, empty };
  }
}

/** What's drawn as a path. */
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** What groups others and is drawn through. */
const GROUPS = new Set(["svg", "g", "a", "switch"]);

/** What an element passes down: paint and transform, and whether anything under it is drawn. */
type Context = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: "nonzero" | "evenodd";
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  fillOpacity: number;
  strokeOpacity: number;
  /** Opacity of the groups above, multiplied: not inherited as SVG has it, but close for a morph. */
  opacity: number;
  /** What `currentColor` is here, if anything above set `color`. */
  color: string | undefined;
  visible: boolean;
  matrix: Matrix;
  /** Under something that isn't drawn (`defs`, a clip, `display: none`): its contents aren't either. */
  hidden: boolean;
};

const ROOT_CONTEXT: Context = {
  fill: "black",
  stroke: "none",
  strokeWidth: 1,
  fillRule: "nonzero",
  cap: "butt",
  join: "miter",
  fillOpacity: 1,
  strokeOpacity: 1,
  opacity: 1,
  color: undefined,
  visible: true,
  matrix: IDENTITY,
  hidden: false,
};

/** An element's own style: its presentation attributes, overridden by its `style` attribute. */
function ownStyle(attributes: Record<string, string>) {
  const style: Record<string, string> = {};
  for (const name of ["fill", "stroke", "stroke-width", "fill-rule", "stroke-linecap", "stroke-linejoin", "fill-opacity", "stroke-opacity", "opacity", "color", "display", "visibility"]) {
    if (attributes[name] !== undefined) style[name] = attributes[name].trim();
  }
  for (const declaration of (attributes.style ?? "").split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!important/i, "")
      .trim();
    if (name && value) style[name] = value;
  }
  return style;
}

const fraction = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const number = value.endsWith("%") ? parseFloat(value) / 100 : parseFloat(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};

const length = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
};

function contextFor(parent: Context, name: string, attributes: Record<string, string>): Context {
  const style = ownStyle(attributes);
  const hidden = parent.hidden || style.display === "none" || !(GROUPS.has(name) || SHAPES.has(name));
  const color = style.color && style.color !== "inherit" && style.color !== "currentColor" ? style.color : parent.color;
  const inherit = (value: string | undefined, fallback: string) => (value === undefined || value === "inherit" ? fallback : value);
  let matrix = parent.matrix;
  // A nested svg places its contents where it's put (its own viewBox isn't fitted).
  if (name === "svg" && parent !== ROOT_CONTEXT) matrix = multiply(matrix, [1, 0, 0, 1, length(attributes.x, 0), length(attributes.y, 0)]);
  if (attributes.transform) matrix = multiply(matrix, parseTransform(attributes.transform));
  return {
    fill: inherit(style.fill, parent.fill),
    stroke: inherit(style.stroke, parent.stroke),
    strokeWidth: style["stroke-width"] === undefined || style["stroke-width"] === "inherit" ? parent.strokeWidth : length(style["stroke-width"], parent.strokeWidth),
    fillRule: style["fill-rule"] === "evenodd" ? "evenodd" : style["fill-rule"] === "nonzero" ? "nonzero" : parent.fillRule,
    cap: style["stroke-linecap"] === "butt" || style["stroke-linecap"] === "round" || style["stroke-linecap"] === "square" ? style["stroke-linecap"] : parent.cap,
    join:
      style["stroke-linejoin"] === "miter" || style["stroke-linejoin"] === "round" || style["stroke-linejoin"] === "bevel" ? style["stroke-linejoin"] : parent.join,
    fillOpacity: style["fill-opacity"] === undefined ? parent.fillOpacity : fraction(style["fill-opacity"], 1),
    strokeOpacity: style["stroke-opacity"] === undefined ? parent.strokeOpacity : fraction(style["stroke-opacity"], 1),
    opacity: parent.opacity * fraction(style.opacity, 1),
    color,
    visible: style.visibility === "hidden" || style.visibility === "collapse" ? false : style.visibility === "visible" ? true : parent.visible,
    matrix,
    hidden,
  };
}

/** A paint as written: nothing (`none`), the current colour, or a colour. Gradients and patterns read as the current colour. */
function paint(value: string, current: string | undefined): { drawn: false } | { drawn: true; color: string | undefined } {
  const v = value.trim();
  if (v === "none" || v === "transparent") return { drawn: false };
  if (v === "currentColor" || v === "currentcolor" || v.startsWith("url(")) return { drawn: true, color: current };
  return { drawn: true, color: v };
}

/** A shape's subpaths as path data, exactly. */
const pathData = (paths: Subpath[]) => paths.map((path) => subpathData(path, 4)).join("");

/** Every point a subpath is drawn through or pulled towards: enough for a box around it. */
const pointsOf = (path: Subpath) => [path.start, ...path.segments.flatMap((s) => (s.kind === "line" ? [s.to] : [s.c1, s.c2, s.to]))];

/**
 * A drawing from SVG markup: every fill and every stroke of its shapes (`path`, `rect`,
 * `circle`, `ellipse`, `line`, `polyline`, `polygon`), transforms applied, with its colour,
 * opacity and width; and its canvas, from `viewBox`, else `width` and `height`, else what it
 * draws. Paint follows SVG: fills are black and strokes none unless said otherwise, and an
 * element inherits what the groups around it set.
 */
export function svg(markup: string): Drawing {
  const parts: DrawingPart[] = [];
  const stack: { name: string; context: Context }[] = [];
  let viewBox: Box | null = null;
  let size: [number, number] | null = null;
  let found = false;

  for (const tag of tags(markup)) {
    if (tag.closing) {
      // Up to the element it closes (markup that forgot to close a tag closes it here).
      const at = stack.map((entry) => entry.name).lastIndexOf(tag.name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const parent = stack.length ? stack[stack.length - 1].context : ROOT_CONTEXT;
    if (tag.name === "svg" && !found) {
      found = true;
      const numbers = (tag.attributes.viewBox ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0) viewBox = [numbers[0], numbers[1], numbers[2], numbers[3]];
      const width = parseFloat(tag.attributes.width ?? "");
      const height = parseFloat(tag.attributes.height ?? "");
      if (width > 0 && height > 0) size = [width, height];
    } else if (!found) {
      continue;
    }
    const context = contextFor(parent, tag.name, tag.attributes);
    if (SHAPES.has(tag.name) && !context.hidden && context.visible) {
      const paths = parsePath(elementPath([tag.name, tag.attributes])).map((path) => transformSubpath(path, context.matrix));
      if (paths.length) {
        const fill = paint(context.fill, context.color);
        const stroke = paint(context.stroke, context.color);
        // A line has nothing to fill.
        if (fill.drawn && tag.name !== "line") {
          const part: DrawingPart = { kind: "fill", d: pathData(paths), rule: context.fillRule };
          if (fill.color !== undefined) part.color = fill.color;
          const opacity = context.opacity * context.fillOpacity;
          if (opacity < 1) part.opacity = opacity;
          parts.push(part);
        }
        // A non-uniform transform stretches a stroke unevenly; its average is close enough to morph with.
        const [a, b, c, d] = context.matrix;
        const width = context.strokeWidth * Math.sqrt(Math.abs(a * d - b * c));
        if (stroke.drawn && width > 0) {
          const part: DrawingPart = { kind: "stroke", d: pathData(paths), width, cap: context.cap, join: context.join };
          if (stroke.color !== undefined) part.color = stroke.color;
          const opacity = context.opacity * context.strokeOpacity;
          if (opacity < 1) part.opacity = opacity;
          parts.push(part);
        }
      }
    }
    if (!tag.empty) stack.push({ name: tag.name, context });
  }
  if (!found) throw new Error("No <svg> element in the markup");
  if (!viewBox && size) viewBox = [0, 0, size[0], size[1]];
  if (!viewBox) viewBox = boxAround(parts.flatMap((part) => parsePath(part.d).flatMap(pointsOf))) ?? [0, 0, 24, 24];
  return { parts, viewBox };
}

/** The smallest box round some points, or nothing for no points. */
export function boxAround(points: Vec[]): Box | null {
  if (!points.length) return null;
  let [x0, y0] = points[0];
  let [x1, y1] = points[0];
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0 || 1, y1 - y0 || 1];
}
