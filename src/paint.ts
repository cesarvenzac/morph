/**
 * Drawing a frame: each part as a `<path>`'s attributes, or a whole frame as SVG markup. An
 * icon's parts are strokes in the current colour, `strokeWidth` wide at a width of 1, with round
 * ends; a drawing's carry their own paint.
 */

import type { Morph, Part } from "./morph.ts";

/** A `<path>`'s attributes, as SVG names them: for `setAttribute`, or markup. */
export type Attributes = {
  d: string;
  fill: string;
  stroke: string;
  "fill-opacity"?: string;
  "fill-rule"?: "evenodd";
  "stroke-width"?: string;
  "stroke-linecap"?: "butt" | "round" | "square";
  "stroke-linejoin"?: "miter" | "round" | "bevel";
  opacity?: string;
};

export type PaintOptions = {
  /** For icons: how wide a stroke of width 1 is drawn, in grid units. Lucide's 2 unless said. */
  strokeWidth?: number;
};

const number = (value: number) => String(Number(value.toFixed(4)));

/**
 * A part as a `<path>` draws it: its path data and its paint, the fill rule its holes need.
 * Every part of a morph gets the same attributes, frame after frame, so setting them all each
 * frame leaves nothing behind from the last.
 */
export function attributesOf(part: Part, { strokeWidth = 2 }: PaintOptions = {}): Attributes {
  if (part.fill === undefined) {
    return { d: part.d, fill: "none", stroke: "currentColor", "stroke-width": number(strokeWidth * part.width), "stroke-linecap": "round", "stroke-linejoin": "round" };
  }
  const color = part.color ?? "currentColor";
  return {
    d: part.d,
    fill: part.fill > 0 ? color : "none",
    stroke: part.width > 0 ? color : "none",
    "fill-opacity": number(part.fill),
    "fill-rule": "evenodd",
    "stroke-width": number(part.width),
    "stroke-linecap": part.cap ?? "round",
    "stroke-linejoin": part.join ?? "round",
    opacity: number(part.opacity ?? 1),
  };
}

/** Whether an attribute only says what SVG would assume, or paints what isn't drawn. */
const needless = (name: string, value: string, attributes: Attributes) =>
  ((name === "fill-opacity" || name === "opacity") && value === "1") ||
  (name.startsWith("fill-") && attributes.fill === "none") ||
  (name.startsWith("stroke-") && attributes.stroke === "none");

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export type SvgOptions = PaintOptions & {
  /** What the current colour is: the colour of an icon's strokes, and of parts that name none. */
  color?: string;
  /** Its size in pixels, if it's to have one (otherwise it fills what holds it). */
  width?: number;
  height?: number;
};

/** The frame at `t` as an SVG document: for a server, an `<img>`, a file or a GIF's frames. */
export function svgOf(m: Morph, t: number, { color, width, height, ...paint }: SvgOptions = {}): string {
  const root = [`xmlns="http://www.w3.org/2000/svg"`, `viewBox="${m.viewBox.map(number).join(" ")}"`];
  if (width !== undefined) root.push(`width="${number(width)}"`);
  if (height !== undefined) root.push(`height="${number(height)}"`);
  if (color !== undefined) root.push(`color="${escape(color)}"`);
  const paths = m
    .at(t)
    .filter((part) => part.d)
    .map((part) => {
      const attributes = attributesOf(part, paint);
      return `<path ${Object.entries(attributes)
        .filter(([name, value]) => value !== undefined && !needless(name, value, attributes))
        .map(([name, value]) => `${name}="${escape(value!)}"`)
        .join(" ")}/>`;
    });
  return `<svg ${root.join(" ")}>${paths.join("")}</svg>`;
}
