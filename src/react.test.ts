import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Source } from "./drawing.ts";
import { ICONS } from "./icons.fixture.ts";
import { morph, type Morph } from "./morph.ts";
import { sprung, type Motion } from "./motion.ts";
import { MorphFrame, MorphIcon, useMorph, useMorphing, type MorphingOptions } from "./react.tsx";
import { svg } from "./svg.ts";

const render = (node: ReactNode) => renderToStaticMarkup(node);

/**
 * Just enough of the DOM for React to mount components that draw nothing (the hooks' probes), so
 * their effects run: a container, a window to read the current event from, and
 * requestAnimationFrame on a clock the test moves on, 16 ms a frame.
 */
function page() {
  const listens = { addEventListener() {}, removeEventListener() {} };
  const container = { nodeType: 1, nodeName: "DIV", tagName: "DIV", textContent: "", ownerDocument: { nodeType: 9, ...listens }, ...listens };
  vi.stubGlobal("window", { event: undefined, document: { activeElement: null, body: null }, HTMLIFrameElement: class {} });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let queue: { id: number; callback: FrameRequestCallback }[] = [];
  let id = 0;
  let now = 1000;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push({ id: ++id, callback });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (cancelled: number) => {
    queue = queue.filter((frame) => frame.id !== cancelled);
  });
  const root = createRoot(container as unknown as Element);
  return {
    render: (node: ReactNode) => act(async () => root.render(node)),
    /** Runs frames until none is asked for (or `most` have run). */
    frames: (most = 600) =>
      act(async () => {
        for (let ran = 0; queue.length && ran < most; ran++) {
          const due = queue;
          queue = [];
          now += 16;
          for (const frame of due) frame.callback(now);
        }
      }),
    unmount: () => act(async () => root.unmount()),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});
const paths = (markup: string) => [...markup.matchAll(/<path d="([^"]*)"/g)].map((match) => match[1]).sort();

describe("MorphIcon", () => {
  it("draws its icon as it is, 24 wide, hidden from assistive tech unless it's named", () => {
    const markup = render(createElement(MorphIcon, { icon: ICONS.plus }));
    expect(markup).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">/);
    expect(paths(markup)).toEqual(["M12 5L12 19", "M5 12L19 12"]);
    expect(markup).toContain(`fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`);
    const named = render(createElement(MorphIcon, { icon: ICONS.plus, "aria-label": "Add", role: "img", size: 32, strokeWidth: 1.5, className: "icon" }));
    expect(named).not.toContain("aria-hidden");
    expect(named).toContain(`width="32"`);
    expect(named).toContain(`class="icon"`);
    expect(named).toContain(`stroke-width="1.5"`);
  });

  it("draws a drawing in its own paint", () => {
    const disc = svg(`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="tomato"/></svg>`);
    const markup = render(createElement(MorphIcon, { icon: disc }));
    expect(markup).toContain(`viewBox="0 0 10 10"`);
    expect(markup).toContain(`fill="tomato"`);
    expect(markup).toContain(`fill-rule="evenodd"`);
  });
});

describe("MorphFrame", () => {
  it("draws a morph at t", () => {
    const m = morph(ICONS.plus, ICONS.x);
    const markup = render(createElement(MorphFrame, { morph: m, t: 0.5 }));
    expect(paths(markup)).toEqual(m.at(0.5).map((part) => part.d).sort());
    // No size of its own unless it's given one.
    expect(markup.slice(0, markup.indexOf(">"))).not.toMatch(/ (width|height)=/);
  });
});

describe("hooks", () => {
  it("useMorph builds the morph its sides say; useMorphing starts at rest on its source", () => {
    let built: Morph | null = null;
    let shown: string[] = [];
    function Probe() {
      built = useMorph(["M5 12h14"], ICONS.x);
      shown = useMorphing(ICONS.menu).parts.map((part) => part.d);
      return null;
    }
    render(createElement(Probe));
    expect(built!.at(1).map((part) => part.d).filter(Boolean).sort()).toEqual(morph(ICONS.minus, ICONS.x).at(1).map((part) => part.d).filter(Boolean).sort());
    expect(shown.sort()).toEqual(["M4 12L20 12", "M4 19L20 19", "M4 5L20 5"]);
  });
});

describe("useMorphing, as its source changes", () => {
  it("makes the morph to it with the options it has then, and springs on their spring", async () => {
    const { render, frames, unmount } = page();
    let shown: Motion | null = null;
    function Probe({ icon, options }: { icon: Source; options: MorphingOptions }) {
      shown = useMorphing(icon, { ...options, reducedMotion: false }).motion;
      return null;
    }
    await render(createElement(Probe, { icon: ICONS.plus, options: { way: "even" } }));
    await render(createElement(Probe, { icon: ICONS.x, options: { way: "index" } }));
    expect(shown!.morph.at(0.5)).toEqual(morph(ICONS.plus, ICONS.x, "index").at(0.5));
    await frames();
    expect(shown!.settled).toBe(true);
    // Toggled back from rest, on the way and the spring it has now.
    const slow = { stiffness: 20, damping: 8 };
    await render(createElement(Probe, { icon: ICONS.plus, options: { way: "soft", spring: slow } }));
    expect(shown!.morph.at(0.5)).toEqual(morph(ICONS.plus, ICONS.x, "soft").at(0.5));
    const [away] = sprung(shown!.t - shown!.target, shown!.velocity, 1 / 60, slow);
    expect(shown!.step(1 / 60).t).toBeCloseTo(shown!.target + away, 12);
    await frames();
    expect(shown!.settled).toBe(true);
    expect(shown!.source).toBe(ICONS.plus);
    await unmount();
  });
});
