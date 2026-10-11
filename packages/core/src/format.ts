/** Default number of decimals written in path data. */
export const DEFAULT_PRECISION = 3

/**
 * Formats a coordinate for path data: rounded with `factor` (`10 ** precision`),
 * trailing zeros removed, and never `-0`.
 */
export function formatNumber(value: number, factor: number): string {
  // `+ 0` turns -0 into 0.
  return String(Math.round(value * factor) / factor + 0)
}
