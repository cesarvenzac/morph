import { appendSplitSegmentAt, pointOnSegment, reverse, rotate, segmentCount } from './geometry'

// Points of two subpaths are paired by arc length: the point at, say, 30% of
// one outline's length moves to the point at 30% of the other's (after
// shifting the start of closed outlines to the best place). Each outline is then
// split at the other's anchors, so corners of both shapes keep a counterpart.

/** Samples per segment for arc-length tables. */
const TABLE_STEPS = 16
const MIN_SAMPLES = 128
const MAX_SAMPLES = 1024

/** Arc-length measurements of a subpath. */
interface Measure {
  points: readonly number[]
  count: number
  total: number
  /** Arc length at the start of each segment; `starts[count]` is the total. */
  starts: number[]
  /** For each segment, the arc length from its start at `t = k / TABLE_STEPS`. */
  table: number[]
}

/** An anchor of the merged outline, with the anchor it already is on each side (or -1). */
interface Entry {
  /** Position along the reference outline, as a fraction of its length. */
  at: number
  reference: number
  other: number
}

/**
 * Gives two subpaths the same number of segments, with corresponding anchors
 * at the same relative arc length. Open subpaths may be reversed; closed ones
 * are rotated (cut at a new start point) but never reversed, so their winding
 * is preserved. Returns the new `[a, b]`.
 */
export function correspond(
  a: readonly number[],
  closedA: boolean,
  b: readonly number[],
  closedB: boolean,
): [number[], number[]] {
  if (closedA && !closedB) {
    const [newB, newA] = correspond(b, false, a, true)
    return [newA, newB]
  }

  // From here on, either both are closed, both are open, or only `b` is closed.
  const samples = Math.min(
    MAX_SAMPLES,
    Math.max(MIN_SAMPLES, 8 * Math.max(segmentCount(a), segmentCount(b))),
  )
  let reference: readonly number[] = a
  let other: readonly number[] = b
  let offset = 0

  if (closedB) {
    const otherSamples = sample(measure(b), samples, true)
    const candidates = closedA ? [a] : [a, reverse(a)]
    let best = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      const { shift, cost } = bestShift(sample(measure(candidate), samples, closedA), otherSamples)
      if (cost < best) {
        best = cost
        reference = candidate
        offset = shift / samples
      }
    }
  } else {
    const referenceSamples = sample(measure(a), samples, false)
    const reversed = reverse(b)
    const forward = squaredDistance(referenceSamples, sample(measure(b), samples, false))
    const backward = squaredDistance(referenceSamples, sample(measure(reversed), samples, false))
    if (backward < forward) other = reversed
  }

  return merge(reference, closedA, other, closedB, offset, 0.5 / samples)
}

function measure(points: readonly number[]): Measure {
  const count = segmentCount(points)
  const starts = [0]
  const table = new Array<number>(count * (TABLE_STEPS + 1))
  let total = 0
  for (let i = 0; i < count; i++) {
    let [px, py] = pointOnSegment(points, i, 0)
    let length = 0
    table[i * (TABLE_STEPS + 1)] = 0
    for (let k = 1; k <= TABLE_STEPS; k++) {
      const [x, y] = pointOnSegment(points, i, k / TABLE_STEPS)
      length += Math.hypot(x - px, y - py)
      table[i * (TABLE_STEPS + 1) + k] = length
      px = x
      py = y
    }
    total += length
    starts.push(total)
  }
  return { points, count, total, starts, table }
}

/** Relative arc length of every anchor (`count + 1` values, from 0 to 1). */
function anchorPositions(m: Measure): number[] {
  // Without any length, fall back to spreading anchors evenly.
  return m.starts.map((start, i) => (m.total > 0 ? start / m.total : i / m.count))
}

/** Finds the segment and parameter at relative arc length `at`. */
function locate(m: Measure, at: number): [number, number] {
  if (m.total <= 0) {
    const x = Math.min(Math.max(at, 0), 1) * m.count
    const segment = Math.min(Math.floor(x), m.count - 1)
    return [segment, x - segment]
  }

  const target = at * m.total
  let low = 0
  let high = m.count - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (m.starts[middle] <= target) low = middle
    else high = middle - 1
  }

  const local = target - m.starts[low]
  const base = low * (TABLE_STEPS + 1)
  if (m.table[base + TABLE_STEPS] <= 0) return [low, 0]
  let k = 1
  while (k < TABLE_STEPS && m.table[base + k] < local) k++
  const before = m.table[base + k - 1]
  const after = m.table[base + k]
  const fraction = after > before ? (local - before) / (after - before) : 0
  return [low, Math.min(1, Math.max(0, (k - 1 + fraction) / TABLE_STEPS))]
}

/**
 * Samples points evenly spread along the outline: `count` samples for a closed
 * outline (the start is not repeated), `count + 1` for an open one.
 */
function sample(m: Measure, count: number, closed: boolean): number[] {
  const out: number[] = []
  const last = closed ? count - 1 : count
  for (let k = 0; k <= last; k++) {
    const [segment, t] = locate(m, k / count)
    out.push(...pointOnSegment(m.points, segment, t))
  }
  return out
}

/**
 * Finds how far to shift the start of a closed outline (sampled in `other`)
 * so its samples best match those of the reference.
 */
function bestShift(
  reference: readonly number[],
  other: readonly number[],
): { shift: number; cost: number } {
  const referenceCount = reference.length / 2
  const otherCount = other.length / 2
  let shift = 0
  let best = Number.POSITIVE_INFINITY

  for (let s = 0; s < otherCount; s++) {
    let cost = 0
    for (let k = 0; k < referenceCount && cost < best; k++) {
      const j = ((k + s) % otherCount) * 2
      const dx = reference[k * 2] - other[j]
      const dy = reference[k * 2 + 1] - other[j + 1]
      cost += dx * dx + dy * dy
    }
    if (cost < best) {
      best = cost
      shift = s
    }
  }
  return { shift, cost: best }
}

/**
 * Splits both outlines so that each has an anchor wherever the other has one,
 * then rotates the closed `other` outline so both start at the same place.
 * Anchors of both sides closer than `tolerance` are paired instead of split.
 */
function merge(
  reference: readonly number[],
  referenceClosed: boolean,
  other: readonly number[],
  otherClosed: boolean,
  offset: number,
  tolerance: number,
): [number[], number[]] {
  const mr = measure(reference)
  const mo = measure(other)
  const referenceAnchors = anchorPositions(mr)
  const otherAnchors = anchorPositions(mo)
  const toOther = (at: number): number => (otherClosed ? wrap(at + offset) : at)

  // Every anchor of both sides, positioned along the reference outline.
  const events: { at: number; side: 0 | 1; index: number }[] = []
  const lastReference = referenceClosed ? mr.count - 1 : mr.count
  for (let i = 0; i <= lastReference; i++) {
    events.push({ at: referenceAnchors[i], side: 0, index: i })
  }
  if (otherClosed) {
    for (let j = 0; j < mo.count; j++)
      events.push({ at: wrap(otherAnchors[j] - offset), side: 1, index: j })
    // An open reference ends where the cut closed outline ends: back at its start.
    if (!referenceClosed) events.push({ at: 1, side: 1, index: mo.count })
  } else {
    for (let j = 0; j <= mo.count; j++) events.push({ at: otherAnchors[j], side: 1, index: j })
  }
  events.sort((p, q) => p.at - q.at || p.side - q.side)

  const entries: Entry[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const next = events[i + 1]
    if (next !== undefined && next.side !== event.side && next.at - event.at <= tolerance) {
      const [r, o] = event.side === 0 ? [event, next] : [next, event]
      entries.push({ at: r.at, reference: r.index, other: o.index })
      i++
    } else if (event.side === 0) {
      entries.push({ at: event.at, reference: event.index, other: -1 })
    } else {
      entries.push({ at: event.at, reference: -1, other: event.index })
    }
  }

  // An anchor of the closed `other` just before the end pairs with the start.
  const last = entries[entries.length - 1]
  if (
    referenceClosed &&
    entries.length > 1 &&
    entries[0].other === -1 &&
    last.reference === -1 &&
    1 - last.at <= tolerance
  ) {
    entries[0].other = last.other
    entries.pop()
  }

  const referenceSplits = entries.filter((e) => e.reference === -1).map((e) => e.at)
  const otherSplits = entries
    .filter((e) => e.other === -1)
    .map((e) => toOther(e.at))
    .sort((p, q) => p - q)

  const newReference = splitAt(mr, referenceSplits)
  let newOther = splitAt(mo, otherSplits)

  if (otherClosed) {
    // Rotate so that `other` starts at the anchor paired with the reference's start.
    const first = entries[0]
    const start = first.other !== -1 ? otherAnchors[first.other] : toOther(first.at)
    let index = 0
    for (let j = 0; j < mo.count; j++) if (otherAnchors[j] < start) index++
    for (const split of otherSplits) if (split < start) index++
    newOther = rotate(newOther, index)
  }

  return [newReference, newOther]
}

/** Splits an outline at the given increasing relative arc lengths. */
function splitAt(m: Measure, positions: readonly number[]): number[] {
  const bySegment: number[][] = Array.from({ length: m.count }, () => [])
  for (const position of positions) {
    const [segment, t] = locate(m, position)
    bySegment[segment].push(t)
  }
  const out = [m.points[0], m.points[1]]
  for (let i = 0; i < m.count; i++) appendSplitSegmentAt(m.points, i, bySegment[i], out)
  return out
}

function wrap(at: number): number {
  const wrapped = at - Math.floor(at)
  return wrapped >= 1 ? 0 : wrapped
}

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return sum
}
