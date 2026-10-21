import { describe, expect, it } from "vitest";

import { ICONS } from "./icons.fixture.ts";
import { morph } from "./morph.ts";
import { keyOf, motion, PRESS, sprung, type Motion } from "./motion.ts";

const ds = (m: Motion) =>
  m
    .frame()
    .map((part) => part.d)
    .filter(Boolean)
    .sort();

/** Steps a motion on at 60 frames a second until it settles (or `most` seconds pass), with every t it passed. */
function play(m: Motion, most = 3) {
  const seen: number[] = [];
  for (let k = 0; k < most * 60 && !m.settled; k++) {
    m = m.step(1 / 60);
    seen.push(m.t);
  }
  return { m, seen };
}

describe("motion", () => {
  it("rests on its source, drawn exactly as it is", () => {
    const icon = motion(ICONS.menu);
    expect(icon.settled).toBe(true);
    expect(icon.source).toBe(ICONS.menu);
    expect(icon.viewBox).toEqual([0, 0, 24, 24]);
    expect(ds(icon)).toEqual(ds(motion(ICONS.menu).toward(ICONS.x).jump().toward(ICONS.menu).jump()));
    expect(icon.step(1 / 60)).toBe(icon);
  });

  it("springs to the next source without overshooting, nearly there in a quarter of a second, settled in under one", () => {
    const going = motion(ICONS.plus).toward(ICONS.x);
    expect([going.t, going.target, going.settled, going.source]).toEqual([0, 1, false, ICONS.x]);
    const { m, seen } = play(going);
    expect(m.settled).toBe(true);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(seen.findIndex((t) => t > 0.9)).toBeLessThan(0.25 * 60);
    expect(seen.length).toBeLessThan(60);
    expect(ds(m)).toEqual(ds(motion(ICONS.x)));
  });

  it("turns back from where it is, at the speed it was going, when told to go back mid-way", () => {
    let m = motion(ICONS.plus).toward(ICONS.x);
    for (let k = 0; k < 6; k++) m = m.step(1 / 60);
    const turned = m.toward(ICONS.plus);
    expect(turned.morph).toBe(m.morph);
    expect([turned.t, turned.velocity, turned.target]).toEqual([m.t, m.velocity, 0]);
    // No jump as it turns: the next frame is close to where it was (a little on, as a spring
    // carries on before it turns), then it goes home.
    const next = turned.step(1 / 60);
    expect(Math.abs(next.t - m.t)).toBeLessThan(0.08);
    expect(next.velocity).toBeLessThan(turned.velocity);
    const { m: home } = play(turned);
    expect(home.t).toBe(0);
    expect(ds(home)).toEqual(ds(motion(ICONS.plus)));
  });

  it("moves the same at any frame rate, a step of any length landing where the spring would", () => {
    const start = motion(ICONS.plus).toward(ICONS.x);
    const by = (step: number, steps: number) => {
      let m = start;
      for (let k = 0; k < steps; k++) m = m.step(step);
      return m;
    };
    // A fifth of a second at 240, 60 and 15 frames a second, and in one step.
    const fast = by(1 / 240, 48);
    for (const m of [by(1 / 60, 12), by(1 / 15, 3), by(0.2, 1)]) {
      expect(m.t).toBeCloseTo(fast.t, 9);
      expect(m.velocity).toBeCloseTo(fast.velocity, 9);
    }
    // Never past where it's headed, at any of them, and settled after a long pause.
    for (const step of [1 / 60, 1 / 15, 1 / 5]) {
      let m: Motion = start;
      for (let k = 0; k < 40 && !m.settled; k++) {
        m = m.step(step);
        expect(m.t).toBeLessThanOrEqual(1.001);
      }
      expect(m.settled).toBe(true);
    }
    expect(start.step(2).settled).toBe(true);
  });

  it("springs as its spring says, under-, over- or critically damped", () => {
    // Exactly as the spring's own equation moves: x'' = -k x - c x', from a step small enough.
    for (const spring of [{ stiffness: 260, damping: 10 }, { stiffness: 100, damping: 20 }, { stiffness: 100, damping: 60 }]) {
      let x = 1;
      let v = 0;
      const dt = 1e-5;
      for (let k = 0; k < 20_000; k++) {
        v += (-spring.stiffness * x - spring.damping * v) * dt;
        x += v * dt;
      }
      const [away, velocity] = sprung(1, 0, 0.2, spring);
      expect(away).toBeCloseTo(x, 3);
      expect(velocity).toBeCloseTo(v, 2);
    }
  });

  it("plays a toggle's one morph both ways", () => {
    const there = play(motion(ICONS.menu).toward(ICONS.x)).m;
    const back = there.toward(ICONS.menu);
    expect(back.morph).toBe(there.morph);
    expect(play(back).m.t).toBe(0);
  });

  it("goes on from the frame it's at when told to go somewhere new mid-way", () => {
    let m = motion(ICONS.heart).toward(ICONS.star);
    for (let k = 0; k < 8; k++) m = m.step(1 / 60);
    const onward = m.toward(ICONS.circle);
    expect(onward.morph).not.toBe(m.morph);
    expect([onward.t, onward.target]).toEqual([0, 1]);
    // It starts where the last one was.
    expect(ds(onward)).toEqual(ds(m));
    expect(ds(play(onward).m)).toEqual(ds(motion(ICONS.circle)));
  });

  it("lets go of strokes mostly gone when it's turned elsewhere, rather than drawing them whole again", () => {
    let m = motion(ICONS.sun).toward(ICONS.moon);
    while (m.t < 0.9) m = m.step(1 / 60);
    const onward = m.toward(ICONS.circle);
    expect(onward.frame().filter((part) => part.d).length).toBeLessThan(m.frame().filter((part) => part.d).length);
  });

  it("jumps where it's headed, for reduced motion", () => {
    const m = motion(ICONS.copy).toward(ICONS.check).jump();
    expect(m.settled).toBe(true);
    expect(ds(m)).toEqual(ds(motion(ICONS.check)));
  });

  it("knows an icon written out again is the same icon", () => {
    const icon = motion(["M5 12h14"]);
    expect(icon.toward(["M5 12h14"])).toBe(icon);
    expect(keyOf("M5 12h14")).toBe("M5 12h14");
    expect(keyOf(ICONS.plus)).toBe(keyOf(JSON.parse(JSON.stringify(ICONS.plus))));
  });

  it("takes a spring of its own, and the morph's options", () => {
    const stiff = play(motion(ICONS.plus, { spring: { stiffness: 900, damping: 60 } }).toward(ICONS.x)).seen.length;
    expect(stiff).toBeLessThan(play(motion(ICONS.plus, { spring: PRESS }).toward(ICONS.x)).seen.length);
    const even = motion(ICONS.plus, { way: "even" }).toward(ICONS.x);
    expect(even.morph.at(0.5)).toEqual(morph(ICONS.plus, ICONS.x, "even").at(0.5));
  });
});
