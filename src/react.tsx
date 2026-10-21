"use client";

/**
 * Morphs in React. `MorphIcon` shows an icon, or any drawing, and springs to the next whenever
 * `icon` changes, turning back from where it is when it's changed back mid-way:
 *
 *   import { MorphIcon } from "@cesarvenzac/morph/react";
 *
 *   <button onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>
 *     <MorphIcon icon={open ? X : Menu} />
 *   </button>
 *
 * `useMorph` keeps a morph across renders and `MorphFrame` draws one at any `t`, for morphs you
 * drive yourself (a slider, a scroll position); `useMorphing` is `MorphIcon`'s motion without its
 * `<svg>`. Client components, all of them.
 */

import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";

import type { Source } from "./drawing.ts";
import { morph, type Method, type Morph, type Options, type Part, type Steps } from "./morph.ts";
import { keyOf, motion, type MotionOptions } from "./motion.ts";
import { attributesOf, type PaintOptions } from "./paint.ts";
import type { Box } from "./svg.ts";

/** A morph kept across renders, made again only when a side or the options change. */
export function useMorph(from: Source, to: Source, options?: Method | Steps | Options): Morph {
  // Keyed by what the sides say, not by which objects they are: icons written inline are the same icons.
  const a = keyOf(from);
  const b = keyOf(to);
  const how = JSON.stringify(options ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => morph(from, to, options), [a, b, how]);
}

const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export type MorphingOptions = MotionOptions & {
  /** Whether to change at once rather than spring: `prefers-reduced-motion` unless said. */
  reducedMotion?: boolean;
};

/**
 * A source played as `MorphIcon` plays it: what to draw now and on what canvas, springing to each
 * new source. Options are read when the source changes.
 */
export function useMorphing(source: Source, options: MorphingOptions = {}) {
  const key = keyOf(source);
  const [current, setCurrent] = useState(() => motion(source, options));
  const latest = useRef(current);
  const settings = useRef(options);
  useEffect(() => {
    settings.current = options;
  });
  useEffect(() => {
    if (key === keyOf(latest.current.source)) return;
    if (settings.current.reducedMotion ?? prefersReducedMotion()) {
      latest.current = motion(source, settings.current);
      setCurrent(latest.current);
      return;
    }
    latest.current = latest.current.toward(source);
    setCurrent(latest.current);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      // The first frame only notes the time; a long gap (a tab in the background) counts as a short one.
      const seconds = last ? Math.min(1 / 30, (now - last) / 1000) : 0;
      last = now;
      latest.current = latest.current.step(seconds);
      setCurrent(latest.current);
      if (!latest.current.settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The source is read through its key: a new array for the same icon isn't a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const parts = useMemo(() => current.frame(), [current]);
  return { parts, viewBox: current.viewBox, motion: current };
}

/** A part's attributes as React names them. */
function pathProps(part: Part, options: PaintOptions): SVGProps<SVGPathElement> {
  const attributes = attributesOf(part, options);
  return {
    d: attributes.d,
    fill: attributes.fill,
    stroke: attributes.stroke,
    fillOpacity: attributes["fill-opacity"],
    fillRule: attributes["fill-rule"],
    strokeWidth: attributes["stroke-width"],
    strokeLinecap: attributes["stroke-linecap"],
    strokeLinejoin: attributes["stroke-linejoin"],
    opacity: attributes.opacity,
  };
}

type SvgProps = Omit<SVGProps<SVGSVGElement>, "children" | "ref" | "viewBox">;

type DrawnProps = SvgProps & PaintOptions & { parts: Part[]; viewBox: Box; size?: number | string };

/** Parts in an `<svg>` on their canvas: hidden from assistive tech unless it's given a name. */
function Drawn({ parts, viewBox, size, strokeWidth, ...svg }: DrawnProps) {
  const named = svg["aria-label"] !== undefined || svg["aria-labelledby"] !== undefined;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox.join(" ")} width={size} height={size} aria-hidden={named ? undefined : true} {...svg}>
      {parts.map((part, k) => (
        <path key={k} {...pathProps(part, { strokeWidth })} />
      ))}
    </svg>
  );
}

export type MorphFrameProps = SvgProps &
  PaintOptions & {
    morph: Morph;
    /** The moment drawn, from 0 (the first side) to 1 (the second). */
    t: number;
    /** Its width and height, if it's to have them. */
    size?: number | string;
  };

/** A morph drawn at `t`: an `<svg>` on its canvas, a path a part. */
export function MorphFrame({ morph: m, t, ...props }: MorphFrameProps) {
  return <Drawn parts={m.at(t)} viewBox={m.viewBox} {...props} />;
}

export type MorphIconProps = SvgProps &
  PaintOptions &
  MorphingOptions & {
    /** What it shows: an icon, or any drawing. Change it, and it springs there. */
    icon: Source;
    /** Its width and height: 24 unless said. */
    size?: number | string;
  };

/** An icon, or any drawing, that springs to the next whenever `icon` changes. */
export function MorphIcon({ icon, size = 24, way, extra, spring, reducedMotion, ...props }: MorphIconProps) {
  const { parts, viewBox } = useMorphing(icon, { way, extra, spring, reducedMotion });
  return <Drawn parts={parts} viewBox={viewBox} size={size} {...props} />;
}
