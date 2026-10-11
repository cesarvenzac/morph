import { morph } from '@morphfx/core'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMorph } from '../src'

const square = 'M10 10 H90 V90 H10 Z'
const circle = 'M50 10 A40 40 0 1 1 50 90 A40 40 0 1 1 50 10 Z'

describe('useMorph', () => {
  it('returns an interpolator through the paths', () => {
    const { result } = renderHook(() => useMorph([square, circle]))
    expect(result.current(0.3)).toBe(morph(square, circle)(0.3))
  })

  it('keeps the same function while paths and options are equal', () => {
    const { result, rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useMorph(paths, { precision: 2 }),
      { initialProps: { paths: [square, circle] } },
    )
    const first = result.current
    rerender({ paths: [square, circle] })
    expect(result.current).toBe(first)
    rerender({ paths: [circle, square] })
    expect(result.current).not.toBe(first)
  })
})
