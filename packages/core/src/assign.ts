/** Above this many cells, fall back from the optimal solver to a greedy one. */
const OPTIMAL_LIMIT = 250_000

/**
 * Solves the assignment problem: pairs rows with columns so that the total
 * cost is minimal, with every row or every column used exactly once
 * (whichever is fewer). Returns, for each row, its column or -1.
 *
 * Uses the Hungarian algorithm (O(n² m)) and falls back to a greedy pairing
 * for very large matrices.
 */
export function assign(cost: readonly (readonly number[])[]): number[] {
  const rows = cost.length
  const columns = rows === 0 ? 0 : cost[0].length
  if (rows === 0 || columns === 0) return new Array<number>(rows).fill(-1)
  if (rows * columns > OPTIMAL_LIMIT) return assignGreedy(cost, rows, columns)
  if (rows <= columns) return hungarian(cost, rows, columns)

  // The solver needs rows ≤ columns: solve the transposed problem.
  const transposed = Array.from({ length: columns }, (_, j) =>
    Array.from({ length: rows }, (_, i) => cost[i][j]),
  )
  const byColumn = hungarian(transposed, columns, rows)
  const result = new Array<number>(rows).fill(-1)
  for (let j = 0; j < columns; j++) result[byColumn[j]] = j
  return result
}

/** Hungarian algorithm with potentials, for rows ≤ columns. */
function hungarian(cost: readonly (readonly number[])[], rows: number, columns: number): number[] {
  // 1-indexed internally; index 0 is a sentinel.
  const u = new Array<number>(rows + 1).fill(0)
  const v = new Array<number>(columns + 1).fill(0)
  const owner = new Array<number>(columns + 1).fill(0)
  const way = new Array<number>(columns + 1).fill(0)

  for (let row = 1; row <= rows; row++) {
    owner[0] = row
    let column = 0
    const minimum = new Array<number>(columns + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Array<boolean>(columns + 1).fill(false)

    do {
      used[column] = true
      const current = owner[column]
      let delta = Number.POSITIVE_INFINITY
      let next = 0
      for (let j = 1; j <= columns; j++) {
        if (used[j]) continue
        const reduced = cost[current - 1][j - 1] - u[current] - v[j]
        if (reduced < minimum[j]) {
          minimum[j] = reduced
          way[j] = column
        }
        if (minimum[j] < delta) {
          delta = minimum[j]
          next = j
        }
      }
      for (let j = 0; j <= columns; j++) {
        if (used[j]) {
          u[owner[j]] += delta
          v[j] -= delta
        } else {
          minimum[j] -= delta
        }
      }
      column = next
    } while (owner[column] !== 0)

    do {
      const previous = way[column]
      owner[column] = owner[previous]
      column = previous
    } while (column !== 0)
  }

  const result = new Array<number>(rows).fill(-1)
  for (let j = 1; j <= columns; j++) if (owner[j] !== 0) result[owner[j] - 1] = j - 1
  return result
}

/** Pairs the cheapest available (row, column) combinations first. */
function assignGreedy(
  cost: readonly (readonly number[])[],
  rows: number,
  columns: number,
): number[] {
  const cells: [number, number, number][] = []
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) cells.push([cost[i][j], i, j])
  cells.sort((a, b) => a[0] - b[0])

  const result = new Array<number>(rows).fill(-1)
  const takenColumns = new Array<boolean>(columns).fill(false)
  let remaining = Math.min(rows, columns)
  for (const [, i, j] of cells) {
    if (result[i] !== -1 || takenColumns[j]) continue
    result[i] = j
    takenColumns[j] = true
    if (--remaining === 0) break
  }
  return result
}
