// The package as someone installing it uses it: typechecked against its published types (as
// NodeNext and as a bundler resolves them) and run, by check/run.sh.
import { EVENLY, morph, nodesData, type Icon, type Stroke } from "@cesarvenzac/morph";

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
console.log("ok", halfway.map((stroke) => stroke.d).join(" | "));
