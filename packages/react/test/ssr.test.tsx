// @vitest-environment node
import { morph } from '@morphfx/core'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MorphPath } from '../src'

const square = 'M10 10 H90 V90 H10 Z'
const circle = 'M50 10 A40 40 0 1 1 50 90 A40 40 0 1 1 50 10 Z'

describe('server rendering', () => {
  it('renders the shape without touching browser APIs', () => {
    expect(typeof window).toBe('undefined')
    const html = renderToString(
      <svg viewBox="0 0 100 100">
        <MorphPath d={square} fill="red" />
      </svg>,
    )
    expect(html).toContain(`d="${square}"`)
    expect(html).toContain('fill="red"')
  })

  it('renders the shape at the initial progress in controlled mode', () => {
    const html = renderToString(
      <svg>
        <MorphPath paths={[square, circle]} progress={0.5} />
      </svg>,
    )
    expect(html).toContain(`d="${morph(square, circle)(0.5)}"`)
  })
})
