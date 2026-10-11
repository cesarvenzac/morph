# Fixtures

Shapes and morph pairs shared by every test suite (and by any future implementation in another language). Plain JSON, no code.

`morphs.json` contains:

- `viewBox`: the coordinate space of every shape (`0 0 100 100`).
- `shapes`: named SVG path data. They cover basic shapes, shapes with holes (in both `nonzero` and `evenodd` styles), shapes with several pieces, icon-like shapes and open paths.
- `pairs`: `[from, to]` shape names to morph between.

The core tests check that every pair morphs exactly into its endpoints, and that paired subpaths keep the same winding.

## Reviewing morphs

```sh
pnpm filmstrip
```

This builds `@morphfx/core` and writes `.filmstrip/index.html`. Each pair appears at several stages of the morph, next to a view of which points pair up.

## Adding a fixture

1. Add the shape(s) to `shapes`, using the `0 0 100 100` coordinate space.
2. Add the pair to `pairs`.
3. Run `pnpm test` and `pnpm filmstrip`, and check the result looks right.

Bad morphs reported in issues should become fixtures, so they stay fixed.
