import fixtures from '../../../fixtures/morphs.json'

export interface Shape {
  name: string
  label: string
  d: string
}

const { shapes } = fixtures as { shapes: Record<string, string> }

/** Closed shapes from the shared fixtures, in a 0 0 100 100 viewBox. */
export const presets: Shape[] = [
  ['circle', 'Circle'],
  ['square', 'Square'],
  ['rounded-square', 'Rounded'],
  ['triangle', 'Triangle'],
  ['hexagon', 'Hexagon'],
  ['star', 'Star'],
  ['star-8', 'Burst'],
  ['heart', 'Heart'],
  ['blob', 'Blob'],
  ['ellipse-wide', 'Ellipse'],
  ['ring', 'Ring'],
  ['square-frame', 'Frame'],
  ['two-circles', 'Two dots'],
  ['three-dots', 'Three dots'],
  ['play', 'Play'],
  ['pause', 'Pause'],
  ['menu', 'Menu'],
  ['close', 'Close'],
  ['plus', 'Plus'],
  ['check', 'Check'],
  ['arrow-right', 'Arrow'],
  ['diamond', 'Diamond'],
  ['moon', 'Moon'],
  ['bolt', 'Bolt'],
].map(([name, label]) => ({ name, label, d: shapes[name] }))
