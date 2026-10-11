# Playground

An interactive page to try `@morphfx/react`:

- morph between 24 shapes, and interrupt morphs mid-flight (**Interrupt test** fires three in a row);
- tune the spring or tween, and the reduced-motion behavior;
- paste your own SVG path data;
- show how points pair up between two shapes, or scrub through a morph by hand;
- copy the matching `<MorphPath>` code.

```sh
pnpm install
pnpm playground
```

Then open the URL it prints (usually http://localhost:5173). The playground imports the packages' source files directly, so changes to `@morphfx/core` or `@morphfx/react` show up instantly, without rebuilding.

`pnpm --filter @morphfx/playground build` writes a single self-contained `dist/index.html` (React included) that can be opened or hosted anywhere.
