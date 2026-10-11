# @morphfx/core

## 0.1.0-next.0

### Minor Changes

- [#1](https://github.com/cesarvenzac/morph/pull/1) [`836d618`](https://github.com/cesarvenzac/morph/commit/836d6186ab21bc0056011e7b88385a7558051de0) Thanks [@cesarvenzac](https://github.com/cesarvenzac)! - Add `@morphfx/core/animate`: tween and spring timing functions (`createTransition`, `cubicBezier`, `easingFunction`) with no timers or platform APIs, so any frame loop can drive a morph. `springPhysics()` and `EASING_CURVES` let other animation engines reproduce the same motion.

- [#1](https://github.com/cesarvenzac/morph/pull/1) [`836d618`](https://github.com/cesarvenzac/morph/commit/836d6186ab21bc0056011e7b88385a7558051de0) Thanks [@cesarvenzac](https://github.com/cesarvenzac)! - Add `morph()`, `prepare()`, `interpolate()` and `mixer()`: morph between arbitrary SVG paths (different point counts, several subpaths, holes, open and closed paths) while keeping curves. Points are paired by relative position along each outline, so shapes don't spin while morphing.
