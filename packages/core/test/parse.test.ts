import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type PathCommandType, PathParseError, parsePath } from '../src'

describe('parsePath', () => {
  it('returns an empty list for empty or whitespace-only input', () => {
    expect(parsePath('')).toEqual([])
    expect(parsePath(' \t\n\r\f')).toEqual([])
  })

  it('parses every command type', () => {
    const d = 'M1 2 L3 4 H5 V6 C1 2 3 4 5 6 S1 2 3 4 Q1 2 3 4 T5 6 A1 2 30 1 0 3 4 Z'
    expect(parsePath(d).map((c) => c.type)).toEqual([
      'M',
      'L',
      'H',
      'V',
      'C',
      'S',
      'Q',
      'T',
      'A',
      'Z',
    ])
    expect(parsePath(d)[8]).toEqual({ type: 'A', values: [1, 2, 30, 1, 0, 3, 4] })
  })

  it('keeps relative commands lowercase', () => {
    expect(parsePath('m1 2l3 4z')).toEqual([
      { type: 'm', values: [1, 2] },
      { type: 'l', values: [3, 4] },
      { type: 'z', values: [] },
    ])
  })

  it('expands implicit repetitions', () => {
    expect(parsePath('M0 0 L1 2 3 4 h5 6')).toEqual([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [1, 2] },
      { type: 'L', values: [3, 4] },
      { type: 'h', values: [5] },
      { type: 'h', values: [6] },
    ])
  })

  it('turns extra moveto pairs into linetos', () => {
    expect(parsePath('M1 2 3 4 5 6')).toEqual([
      { type: 'M', values: [1, 2] },
      { type: 'L', values: [3, 4] },
      { type: 'L', values: [5, 6] },
    ])
    expect(parsePath('m1 2 3 4').map((c) => c.type)).toEqual(['m', 'l'])
    expect(parsePath('M0 0 C1 1 2 2 3 3 4 4 5 5 6 6').map((c) => c.type)).toEqual(['M', 'C', 'C'])
  })

  it('accepts commas, whitespace, or no separator at all', () => {
    const expected = [
      { type: 'M', values: [1, 2] },
      { type: 'L', values: [-3, 4] },
    ]
    expect(parsePath('M1,2L-3,4')).toEqual(expected)
    expect(parsePath('M 1 , 2 L -3 , 4')).toEqual(expected)
    expect(parsePath('M1 2L-3 4')).toEqual(expected)
    expect(parsePath('M1 2-3 4').map((c) => c.values)).toEqual([
      [1, 2],
      [-3, 4],
    ])
  })

  it('reads compact number forms', () => {
    expect(parsePath('M.5.5')[0].values).toEqual([0.5, 0.5])
    expect(parsePath('M1.5.5')[0].values).toEqual([1.5, 0.5])
    expect(parsePath('M-.5-.5')[0].values).toEqual([-0.5, -0.5])
    expect(parsePath('M1. 2.')[0].values).toEqual([1, 2])
    expect(parsePath('M+1+2')[0].values).toEqual([1, 2])
  })

  it('reads exponents', () => {
    expect(parsePath('M1e2 1E-2')[0].values).toEqual([100, 0.01])
    expect(parsePath('M1.5e+1-2e1')[0].values).toEqual([15, -20])
  })

  it('reads arc flags without separators', () => {
    expect(parsePath('M0 0a1 1 0 00 1 1')[1]).toEqual({ type: 'a', values: [1, 1, 0, 0, 0, 1, 1] })
    expect(parsePath('M0 0a1 1 0 1110 10')[1]).toEqual({
      type: 'a',
      values: [1, 1, 0, 1, 1, 10, 10],
    })
    expect(parsePath('M0 0a1,1,0,1,0,2,2')[1].values).toEqual([1, 1, 0, 1, 0, 2, 2])
  })

  describe('errors', () => {
    const cases: [string, string, number][] = [
      ['L1 2', 'must start with a moveto', 0],
      ['  x', 'must start with a moveto', 2],
      ['M1', 'missing arguments', 2],
      ['M1 2 L', 'missing arguments', 6],
      ['M1 2 X3 4', 'unexpected character "X"', 5],
      ['M1 2 Z 3', 'unexpected character "3"', 7],
      ['M,1 2', 'expected a number', 1],
      ['M1 2,', 'expected a number after ","', 4],
      ['M1 2, L3 4', 'expected a number after ","', 4],
      ['M1,,2', 'expected a number', 3],
      ['M0 0 A1 1 0 2 0 1 1', 'expected an arc flag', 12],
      ['M1e400 0', 'number out of range', 1],
      ['M1e 2', 'expected a number', 2],
      ['M1 2e', 'unexpected character "e"', 4],
    ]

    it.each(cases)('rejects %j', (d, reason, index) => {
      let error: unknown
      try {
        parsePath(d)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(PathParseError)
      expect((error as PathParseError).message).toContain(reason)
      expect((error as PathParseError).index).toBe(index)
    })
  })
})

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

const numberArb = fc
  .double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
  .map((n) => (Object.is(n, -0) ? 0 : n))

const commandArb = fc
  .constantFrom(...('MLHVCSQTAZ'.split('') as PathCommandType[]))
  .chain((upper) =>
    fc.tuple(
      fc.constantFrom(upper, upper.toLowerCase() as PathCommandType),
      fc.array(numberArb, { minLength: ARITY[upper], maxLength: ARITY[upper] }),
      fc.boolean(),
      fc.boolean(),
    ),
  )
  .map(([type, values, largeArc, sweep]) => {
    if (type === 'A' || type === 'a') {
      values[3] = largeArc ? 1 : 0
      values[4] = sweep ? 1 : 0
    }
    return { type, values }
  })

const separatorArb = fc.constantFrom(' ', ',', ' , ', '\n', '  \t')

describe('parsePath (property-based)', () => {
  it('reads back any well-formed command list, whatever the separators', () => {
    fc.assert(
      fc.property(
        numberArb,
        numberArb,
        fc.array(commandArb, { maxLength: 20 }),
        separatorArb,
        (x, y, rest, separator) => {
          const commands = [{ type: 'M' as const, values: [x, y] }, ...rest]
          const d = commands.map((c) => c.type + c.values.join(separator)).join(' ')
          expect(parsePath(d)).toEqual(commands)
        },
      ),
    )
  })
})
