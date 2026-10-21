import { afterEach, describe, expect, it, vi } from "vitest";

import { draw, mount } from "./dom.ts";
import { ICONS } from "./icons.fixture.ts";
import { motion } from "./motion.ts";

/** Just enough of the DOM for `draw`: elements with attributes and children, made by a document. */
class FakeElement {
  readonly attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  appendChild(child: FakeElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

class FakeDocument {
  made: string[] = [];
  createElementNS(namespace: string, tag: string) {
    this.made.push(`${namespace} ${tag}`);
    return new FakeElement(tag, this);
  }
}

const svgElement = () => {
  const document = new FakeDocument();
  const svg = new FakeElement("svg", document);
  return { svg, element: svg as unknown as Element, document };
};

const ds = (svg: FakeElement) => svg.children.map((path) => path.getAttribute("d")!).sort();

/** A clock for requestAnimationFrame: frames run when `run` says, 16 ms apart. */
function frames() {
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
  return {
    get waiting() {
      return queue.length;
    },
    run(most = 600) {
      let ran = 0;
      while (queue.length && ran < most) {
        const due = queue;
        queue = [];
        now += 16;
        for (const frame of due) frame.callback(now);
        ran++;
      }
      return ran;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("draw", () => {
  it("draws a path a part on the canvas, in SVG's own namespace", () => {
    const { svg, element, document } = svgElement();
    const m = motion(ICONS.plus);
    draw(element, m.frame(), m.viewBox);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(document.made).toEqual(["http://www.w3.org/2000/svg path", "http://www.w3.org/2000/svg path"]);
    expect(ds(svg)).toEqual(["M12 5L12 19", "M5 12L19 12"]);
    expect(Object.fromEntries(svg.children[0].attributes)).toMatchObject({ fill: "none", stroke: "currentColor", "stroke-width": "2" });
  });

  it("takes away paths there are no parts for, and attributes a part no longer has", () => {
    const { svg, element } = svgElement();
    draw(element, [
      { d: "M0 0h4v4z", width: 0, fill: 0.5, color: "red", opacity: 0.5 },
      { d: "M5 5h1", width: 1, fill: 0 },
    ]);
    expect(svg.children).toHaveLength(2);
    expect(svg.children[0].getAttribute("fill-opacity")).toBe("0.5");
    draw(element, [{ d: "M1 1h2", width: 1 }]);
    expect(svg.children).toHaveLength(1);
    expect([...svg.children[0].attributes.keys()].sort()).toEqual(["d", "fill", "stroke", "stroke-linecap", "stroke-linejoin", "stroke-width"]);
  });

  it("makes paths again that someone else took out", () => {
    const { svg, element } = svgElement();
    draw(element, motion(ICONS.plus).frame());
    svg.children[0].remove();
    draw(element, motion(ICONS.plus).frame());
    expect(ds(svg)).toEqual(["M12 5L12 19", "M5 12L19 12"]);
  });
});

describe("mount", () => {
  it("shows its source, and springs to the next on a clock of frames until it settles", () => {
    const clock = frames();
    const { svg, element } = svgElement();
    const icon = mount(element, ICONS.plus);
    expect(ds(svg)).toEqual(["M12 5L12 19", "M5 12L19 12"]);
    icon.to(ICONS.x);
    expect(clock.waiting).toBe(1);
    const ran = clock.run();
    expect(ran).toBeGreaterThan(10);
    expect(icon.motion.settled).toBe(true);
    expect(ds(svg)).toEqual(ds(svgOfIcon(ICONS.x)));
  });

  it("changes at once under reduced motion, or when set", () => {
    const clock = frames();
    const { svg, element } = svgElement();
    const calm = mount(element, ICONS.plus, { reducedMotion: true });
    calm.to(ICONS.x);
    expect(clock.waiting).toBe(0);
    expect(ds(svg)).toEqual(ds(svgOfIcon(ICONS.x)));
    const other = svgElement();
    const icon = mount(other.element, ICONS.plus, { reducedMotion: false });
    icon.to(ICONS.x);
    icon.set(ICONS.menu);
    expect(clock.waiting).toBe(0);
    expect(other.svg.children).toHaveLength(3);
  });

  it("stops when told, leaving what it drew", () => {
    const clock = frames();
    const { element } = svgElement();
    const icon = mount(element, ICONS.plus, { reducedMotion: false });
    icon.to(ICONS.x);
    clock.run(3);
    icon.stop();
    expect(clock.waiting).toBe(0);
    expect(icon.motion.settled).toBe(false);
  });
});

/** An icon drawn by `draw` into a fresh stand-in, to compare with. */
function svgOfIcon(icon: (typeof ICONS)[keyof typeof ICONS]) {
  const { svg, element } = svgElement();
  draw(element, motion(icon).frame());
  return svg;
}
