import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { assign } from '../src/assign'

/** Lowest total cost over every possible assignment (brute force). */
function bruteForce(cost: number[][]): number {
  const rows = cost.length
  const columns = cost[0].length
  const pairs = Math.min(rows, columns)
  let best = Number.POSITIVE_INFINITY
  const usedRows = new Array<boolean>(rows).fill(false)
  const usedColumns = new Array<boolean>(columns).fill(false)
  const search = (count: number, total: number, startRow: number): void => {
    if (count === pairs) {
      best = Math.min(best, total)
      return
    }
    for (let i = startRow; i < rows; i++) {
      if (usedRows[i]) continue
      usedRows[i] = true
      for (let j = 0; j < columns; j++) {
        if (usedColumns[j]) continue
        usedColumns[j] = true
        search(count + 1, total + cost[i][j], i + 1)
        usedColumns[j] = false
      }
      usedRows[i] = false
    }
  }
  search(0, 0, 0)
  return best
}

function totalCost(cost: number[][], assignment: number[]): number {
  return assignment.reduce((sum, j, i) => (j === -1 ? sum : sum + cost[i][j]), 0)
}

describe('assign', () => {
  it('handles empty matrices', () => {
    expect(assign([])).toEqual([])
    expect(assign([[], []])).toEqual([-1, -1])
  })

  it('finds the optimal assignment', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ]
    expect(assign(cost)).toEqual([1, 0, 2])
  })

  it('leaves extra rows unassigned', () => {
    const assignment = assign([[1], [0], [5]])
    expect(assignment).toEqual([-1, 0, -1])
  })

  it('matches brute force on random matrices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 25, maxLength: 25 }),
        (rows, columns, values) => {
          const cost = Array.from({ length: rows }, (_, i) =>
            Array.from({ length: columns }, (_, j) => values[i * 5 + j]),
          )
          const assignment = assign(cost)
          const assigned = assignment.filter((j) => j !== -1)
          expect(assigned).toHaveLength(Math.min(rows, columns))
          expect(new Set(assigned).size).toBe(assigned.length)
          expect(totalCost(cost, assignment)).toBe(bruteForce(cost))
        },
      ),
    )
  })

  it('falls back to a valid greedy assignment for huge matrices', () => {
    const size = 600
    const cost = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => Math.abs(i - j)),
    )
    const assignment = assign(cost)
    expect(new Set(assignment).size).toBe(size)
    expect(totalCost(cost, assignment)).toBe(0)
  })
})
