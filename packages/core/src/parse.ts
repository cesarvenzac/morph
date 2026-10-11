/** A path command letter. Uppercase is absolute, lowercase is relative. */
export type PathCommandType =
  | 'M'
  | 'm'
  | 'L'
  | 'l'
  | 'H'
  | 'h'
  | 'V'
  | 'v'
  | 'C'
  | 'c'
  | 'S'
  | 's'
  | 'Q'
  | 'q'
  | 'T'
  | 't'
  | 'A'
  | 'a'
  | 'Z'
  | 'z'

/** One command of SVG path data, as written in the source string. */
export interface PathCommand {
  type: PathCommandType
  /**
   * The command's arguments. Implicitly repeated commands (`L 1 2 3 4`) are
   * expanded into separate commands, so `values.length` always equals the
   * command's arity: 2 for M/L/T, 1 for H/V, 6 for C, 4 for S/Q, 7 for A, 0 for Z.
   */
  values: number[]
}

/** Thrown when path data does not follow the SVG path grammar. */
export class PathParseError extends Error {
  /** Position in the source string where parsing failed. */
  readonly index: number

  constructor(reason: string, source: string, index: number) {
    const from = Math.max(0, index - 10)
    const snippet = `${from > 0 ? '…' : ''}${source.slice(from, index + 10)}${index + 10 < source.length ? '…' : ''}`
    super(`Invalid path data at position ${index}: ${reason} (near "${snippet}")`)
    this.name = 'PathParseError'
    this.index = index
  }
}

const ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
}

// Character codes
const TAB = 0x09
const LINE_FEED = 0x0a
const FORM_FEED = 0x0c
const CARRIAGE_RETURN = 0x0d
const SPACE = 0x20
const PLUS = 0x2b
const COMMA = 0x2c
const MINUS = 0x2d
const DOT = 0x2e
const ZERO = 0x30
const ONE = 0x31
const NINE = 0x39
const UPPER_E = 0x45
const LOWER_E = 0x65

function isWhitespace(code: number): boolean {
  return (
    code === SPACE ||
    code === TAB ||
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    code === FORM_FEED
  )
}

function isDigit(code: number): boolean {
  return code >= ZERO && code <= NINE
}

function isNumberStart(code: number): boolean {
  return isDigit(code) || code === DOT || code === MINUS || code === PLUS
}

/**
 * Parses SVG path data (the `d` attribute) into a list of commands.
 *
 * Follows the SVG path grammar, including compact forms such as `M.5.5`,
 * exponents (`1e-3`) and arc flags written without separators (`a1 1 0 00 1 1`).
 * Empty or whitespace-only input returns an empty list.
 *
 * @throws {PathParseError} when the data is malformed.
 */
export function parsePath(d: string): PathCommand[] {
  const commands: PathCommand[] = []
  const length = d.length
  let i = 0

  // Function declarations (not arrow functions) so `never` narrows types at call sites.
  function fail(reason: string, at: number = i): never {
    throw new PathParseError(reason, d, at)
  }

  function skipWhitespace(): void {
    while (i < length && isWhitespace(d.charCodeAt(i))) i++
  }

  /** Skips `wsp* ,? wsp*` and returns the position of the comma, or -1. */
  function skipSeparator(): number {
    skipWhitespace()
    if (i < length && d.charCodeAt(i) === COMMA) {
      const comma = i++
      skipWhitespace()
      return comma
    }
    return -1
  }

  function readNumber(): number {
    const start = i
    let code = d.charCodeAt(i)
    if (code === PLUS || code === MINUS) code = d.charCodeAt(++i)

    let digits = 0
    while (isDigit(code)) {
      digits++
      code = d.charCodeAt(++i)
    }
    if (code === DOT) {
      code = d.charCodeAt(++i)
      while (isDigit(code)) {
        digits++
        code = d.charCodeAt(++i)
      }
    }
    if (digits === 0) fail('expected a number', start)

    if (code === LOWER_E || code === UPPER_E) {
      let j = i + 1
      const next = d.charCodeAt(j)
      if (next === PLUS || next === MINUS) j++
      if (isDigit(d.charCodeAt(j))) {
        i = j
        while (isDigit(d.charCodeAt(i))) i++
      }
    }

    const value = Number(d.slice(start, i))
    if (!Number.isFinite(value)) fail('number out of range', start)
    return value
  }

  function readFlag(): number {
    const code = d.charCodeAt(i)
    if (code !== ZERO && code !== ONE) fail('expected an arc flag (0 or 1)')
    i++
    return code - ZERO
  }

  skipWhitespace()
  if (i < length) {
    const first = d[i]
    if (first !== 'M' && first !== 'm') fail('path data must start with a moveto (M or m)')
  }

  while (i < length) {
    const letter = d[i] as string
    const lower = letter.toLowerCase()
    const arity = ARITY[lower]
    if (arity === undefined) fail(`unexpected character "${letter}"`)
    i++

    if (arity === 0) {
      commands.push({ type: letter as PathCommandType, values: [] })
      skipWhitespace()
      continue
    }

    skipWhitespace()
    let type = letter as PathCommandType
    for (;;) {
      const values = new Array<number>(arity)
      for (let k = 0; k < arity; k++) {
        if (k > 0) skipSeparator()
        if (i >= length) fail(`missing arguments for "${letter}"`)
        values[k] = lower === 'a' && (k === 3 || k === 4) ? readFlag() : readNumber()
      }
      commands.push({ type, values })

      // Extra coordinate pairs after a moveto are implicit linetos.
      if (lower === 'm') type = letter === 'm' ? 'l' : 'L'

      const comma = skipSeparator()
      if (i < length && isNumberStart(d.charCodeAt(i))) continue
      if (comma !== -1) fail('expected a number after ","', comma)
      break
    }
  }

  return commands
}
