---
'@morphfx/core': minor
---

Add `@morphfx/core/animate`: tween and spring timing functions (`createTransition`, `cubicBezier`, `easingFunction`) with no timers or platform APIs, so any frame loop can drive a morph. `springPhysics()` and `EASING_CURVES` let other animation engines reproduce the same motion.
