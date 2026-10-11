import { test } from 'vitest'
import { interpolate, morph, prepare } from '../src'
import { fixtures } from './helpers'

const { shapes } = fixtures

/** A wavy closed outline with `count` line segments, to measure scaling. */
function wavy(count: number, radius: number): string {
  let d = ''
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = radius + (i % 2 === 0 ? 4 : -4)
    d += `${i === 0 ? 'M' : ' L'}${50 + r * Math.cos(angle)} ${50 + r * Math.sin(angle)}`
  }
  return `${d} Z`
}

const big = wavy(1000, 40)
const bigOther = wavy(700, 30)

test('prepare (once per morph)', async ({ bench }) => {
  await bench.compare(
    bench('icons: play → pause', () => {
      prepare(shapes.play, shapes.pause)
    }),
    bench('shapes: circle → star', () => {
      prepare(shapes.circle, shapes.star)
    }),
    bench('large: 1000 → 700 segments', () => {
      prepare(big, bigOther)
    }),
  )
})

test('frame (every animation frame)', async ({ bench }) => {
  const icon = interpolate(prepare(shapes.play, shapes.pause))
  const star = interpolate(prepare(shapes.circle, shapes.star))
  const large = interpolate(prepare(big, bigOther))
  let t = 0
  await bench.compare(
    bench('icons: play → pause', () => {
      t = (t + 0.01) % 1
      icon(t)
    }),
    bench('shapes: circle → star', () => {
      t = (t + 0.01) % 1
      star(t)
    }),
    bench('large: 1000 → 700 segments', () => {
      t = (t + 0.01) % 1
      large(t)
    }),
  )
})

test('morph (prepare + one frame)', async ({ bench }) => {
  await bench('shapes: heart → blob', () => {
    morph(shapes.heart, shapes.blob)(0.5)
  }).run()
})
