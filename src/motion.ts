/**
 * Morphs that play: a drawing that springs from what it shows to the next source when told, as
 * a button's icon does when it's pressed. Told to go back mid-way, it turns back from where it is,
 * at the speed it was going; told to go somewhere new mid-way, it goes on from the frame it's at.
 * Pure and immutable, the time given to it: the DOM's `mount` and React's `MorphIcon` play it, and
 * so can anything with a clock.
 *
 *   let icon = motion(Menu);
 *   icon = icon.toward(X); // on a press
 *   icon = icon.step(1 / 60); // each frame, until icon.settled
 *   icon.frame(); // what it draws
 */

import { isDrawing, type Source } from "./drawing.ts";
import { morph, stillOf, type Morph, type Options, type Part } from "./morph.ts";
import type { Box, Drawing } from "./svg.ts";

/** A spring, as stiff and as damped as it says. */
export type Spring = { stiffness: number; damping: number };

/** As near critically damped as makes no overshoot: an icon is nearly there in a third of a second, with no wobble. */
export const PRESS: Spring = { stiffness: 260, damping: 32 };

export type MotionOptions = Options & { spring?: Spring };

export type Motion = {
  /** The morph it's moving along: from where it came from to where it was told to go. */
  readonly morph: Morph;
  /** Where it is along it, from 0 to 1. */
  readonly t: number;
  /** How fast it's moving, in `t` a second. */
  readonly velocity: number;
  /** The end it's headed for. */
  readonly target: 0 | 1;
  /** The source it's headed for, or resting on. */
  readonly source: Source;
  /** Whether it's at rest where it's headed. */
  readonly settled: boolean;
  /** The canvas it draws on. */
  readonly viewBox: Box;
  /**
   * Headed for `next`: on as it was if it's going there already, back the way it came if it came
   * from there, and otherwise a new morph from what it shows now (at rest, that's the source; on
   * the way, the frame it's at).
   */
  toward(next: Source): Motion;
  /** `seconds` on, along its spring's exact path: the same at any frame rate, and after a long pause. */
  step(seconds: number): Motion;
  /** Where it's headed, at once: for reduced motion. */
  jump(): Motion;
  /** What it draws now. */
  frame(): Part[];
};

/** What tells two sources apart: the same icon written out twice is the same icon. */
export const keyOf = (source: Source) => (typeof source === "string" ? source : JSON.stringify(source));

/** A stroke this far gone when a motion is turned elsewhere is let go rather than drawn whole again. */
const GONE = 0.5;

type State = { morph: Morph; t: number; velocity: number; target: 0 | 1; sides: [Source, Source]; keys: [string, string]; options: MotionOptions };

class Moving implements Motion {
  readonly morph: Morph;
  readonly t: number;
  readonly velocity: number;
  readonly target: 0 | 1;
  private readonly state: State;

  constructor(state: State) {
    this.state = state;
    ({ morph: this.morph, t: this.t, velocity: this.velocity, target: this.target } = state);
  }

  get source() {
    return this.state.sides[this.target];
  }

  get settled() {
    return this.velocity === 0 && this.t === this.target;
  }

  get viewBox(): Box {
    return [...this.morph.viewBox];
  }

  frame() {
    return this.morph.at(this.t);
  }

  toward(next: Source): Motion {
    const key = keyOf(next);
    const { keys, sides, options } = this.state;
    if (key === keys[this.target]) return this;
    // Back the way it came (or on again), at the speed it was going: a toggle plays its one morph both ways.
    if (key === keys[1 - this.target]) return new Moving({ ...this.state, target: (1 - this.target) as 0 | 1 });
    const here = this.settled ? sides[this.target] : this.here();
    const hereKey = this.settled ? keys[this.target] : keyOf(here);
    return new Moving({ morph: morph(here, next, options), t: 0, velocity: 0, target: 1, sides: [here, next], keys: [hereKey, key], options });
  }

  step(seconds: number): Motion {
    if (this.settled || !(seconds > 0)) return this;
    const [away, velocity] = sprung(this.t - this.target, this.velocity, seconds, this.state.options.spring ?? PRESS);
    const t = this.target + away;
    if (Math.abs(away) < 1e-3 && Math.abs(velocity) < 1e-2) return this.jump();
    return new Moving({ ...this.state, t, velocity });
  }

  jump(): Motion {
    return this.settled ? this : new Moving({ ...this.state, t: this.target, velocity: 0 });
  }

  /** The frame it's at, as a source to morph on from: its parts as they're drawn now. */
  private here(): Source {
    const parts = this.frame().filter((part) => part.d);
    if (parts.every((part) => part.fill === undefined)) return parts.filter((part) => part.width >= GONE).map((part) => part.d);
    const [a, b] = this.state.sides.map((side) => (isDrawing(side) ? side.em : undefined));
    const drawing: Drawing = {
      parts: parts
        .filter((part) => (part.fill ?? 0) >= GONE || part.width > 0)
        .map((part) => ({
          kind: (part.fill ?? 0) >= GONE ? "fill" : "stroke",
          d: part.d,
          width: part.width,
          ...(part.color !== undefined && { color: part.color }),
          ...(part.opacity !== undefined && { opacity: part.opacity }),
          ...(part.cap && { cap: part.cap }),
          ...(part.join && { join: part.join }),
        })),
      viewBox: this.viewBox,
    };
    // Two words of one size stay words of that size, or the next would be fitted to this frame.
    if (a !== undefined && a === b) drawing.em = a;
    return drawing;
  }
}

/**
 * Where a spring is `seconds` on, from `away` from rest moving at `velocity`: its exact path (a
 * unit mass, under, over or critically damped), so a step of any length lands where the spring
 * would, at any frame rate or after a long pause.
 */
export function sprung(away: number, velocity: number, seconds: number, { stiffness, damping }: Spring): [away: number, velocity: number] {
  const w = Math.sqrt(Math.max(0, stiffness));
  if (w === 0) {
    // No pull: the damping alone slows it.
    if (damping <= 0) return [away + velocity * seconds, velocity];
    const slowed = Math.exp(-damping * seconds);
    return [away + (velocity * (1 - slowed)) / damping, velocity * slowed];
  }
  const zeta = damping / (2 * w);
  if (Math.abs(zeta - 1) < 1e-6) {
    const fade = Math.exp(-w * seconds);
    const c = velocity + w * away;
    return [(away + c * seconds) * fade, (velocity - w * c * seconds) * fade];
  }
  if (zeta < 1) {
    const a = zeta * w;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const fade = Math.exp(-a * seconds);
    const cos = Math.cos(wd * seconds);
    const sin = Math.sin(wd * seconds);
    const b = (velocity + a * away) / wd;
    return [fade * (away * cos + b * sin), fade * (velocity * cos - (a * b + away * wd) * sin)];
  }
  const root = w * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w + root;
  const r2 = -zeta * w - root;
  const first = (velocity - r2 * away) / (r1 - r2);
  const second = away - first;
  const e1 = Math.exp(r1 * seconds);
  const e2 = Math.exp(r2 * seconds);
  return [first * e1 + second * e2, r1 * first * e1 + r2 * second * e2];
}

/** A drawing at rest on `source`, ready to be told where to go (`toward`). */
export function motion(source: Source, options: MotionOptions = {}): Motion {
  const key = keyOf(source);
  return new Moving({ morph: stillOf(source), t: 1, velocity: 0, target: 1, sides: [source, source], keys: [key, key], options });
}
