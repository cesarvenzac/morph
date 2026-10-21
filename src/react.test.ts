import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ICONS } from "./icons.fixture.ts";
import { morph, type Morph } from "./morph.ts";
import { MorphFrame, MorphIcon, useMorph, useMorphing } from "./react.tsx";
import { svg } from "./svg.ts";

const render = (node: ReactNode) => renderToStaticMarkup(node);
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
