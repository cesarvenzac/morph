/**
 * Morphs in the page, without a framework: `draw` puts a frame's parts into an `<svg>`, a path a
 * part, and `mount` makes an `<svg>` show a source and spring to the next when told, as a button's
 * icon does:
 *
 *   import { mount } from "@cesarvenzac/morph/dom";
 *
 *   const icon = mount(button.querySelector("svg"), Menu);
 *   button.addEventListener("click", () => icon.to(open ? X : Menu));
 */

import type { Part } from "./morph.ts";
import { motion, type Motion, type MotionOptions } from "./motion.ts";
import { attributesOf, type PaintOptions } from "./paint.ts";
import type { Source } from "./drawing.ts";
import type { Box } from "./svg.ts";

const SVG = "http://www.w3.org/2000/svg";

/** Every attribute a part may set: what isn't set for a part this frame is taken off its path. */
const PAINT = ["d", "fill", "stroke", "fill-opacity", "fill-rule", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity"];

/** The paths `draw` made in each `<svg>`, in order. */
const drawn = new WeakMap<Element, Element[]>();

/**
 * Draws parts into an `<svg>`: one `<path>` a part, made as they're needed and taken away when
 * there are fewer, each with the part's attributes and none left over from the frame before. The
 * paths are drawn after whatever else the `<svg>` holds. `viewBox` sets its canvas.
 */
export function draw(svg: Element, parts: Part[], viewBox?: Box, options: PaintOptions = {}) {
  if (viewBox) svg.setAttribute("viewBox", viewBox.join(" "));
  // Paths someone else took out are made again.
  const paths = (drawn.get(svg) ?? []).filter((path) => path.parentNode === svg);
  while (paths.length < parts.length) paths.push(svg.appendChild(svg.ownerDocument.createElementNS(SVG, "path")));
  while (paths.length > parts.length) paths.pop()!.remove();
  drawn.set(svg, paths);
  parts.forEach((part, k) => {
    const attributes = attributesOf(part, options) as Record<string, string | undefined>;
    for (const name of PAINT) {
      const value = attributes[name];
      if (value === undefined) paths[k].removeAttribute(name);
      else if (paths[k].getAttribute(name) !== value) paths[k].setAttribute(name, value);
    }
  });
}

export type MountOptions = MotionOptions &
  PaintOptions & {
    /** Whether to change at once rather than spring: `prefers-reduced-motion` unless said. */
    reducedMotion?: boolean;
  };

/** An `<svg>` showing a source, springing to the next when told. */
export type Mounted = {
  /** Spring to `next`: back from where it is if it's where it came from, else on from the frame it's at. */
  to(next: Source): void;
  /** Show `next` at once. */
  set(next: Source): void;
  /** Where it is now. */
  readonly motion: Motion;
  /** Stop springing (what's drawn stays). */
  stop(): void;
};

const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Makes `svg` show `source`, and spring to the next source given to `to`. */
export function mount(svg: Element, source: Source, options: MountOptions = {}): Mounted {
  let current = motion(source, options);
  let frame = 0;
  let last = 0;
  const show = () => draw(svg, current.frame(), current.viewBox, options);
  const tick = (now: number) => {
    // The first frame only notes the time; a long gap (a tab in the background) counts as a short one.
    const seconds = last ? Math.min(1 / 30, (now - last) / 1000) : 0;
    last = now;
    current = current.step(seconds);
    show();
    frame = current.settled ? 0 : requestAnimationFrame(tick);
    if (!frame) last = 0;
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const set = (next: Source) => {
    stop();
    current = motion(next, options);
    show();
  };
  const to = (next: Source) => {
    if (options.reducedMotion ?? prefersReducedMotion()) return set(next);
    current = current.toward(next);
    show();
    if (!current.settled && !frame) frame = requestAnimationFrame(tick);
  };
  show();
  return {
    to,
    set,
    get motion() {
      return current;
    },
    stop,
  };
}
