#!/usr/bin/env node
// Renders every fixture pair as a filmstrip (several frames of the morph,
// plus the point correspondence) into an HTML page, to review morph quality
// by eye. Build @morphfx/core first: `pnpm filmstrip` does both.
//
// Usage: node scripts/filmstrip.mjs [output directory] [pair filter]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { interpolate, prepare } from '../packages/core/dist/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? join(root, '.filmstrip'))
const filter = process.argv[3]
const fixtures = JSON.parse(readFileSync(join(root, 'fixtures/morphs.json'), 'utf8'))
const frames = [0, 0.25, 0.5, 0.75, 1]
const viewBox = fixtures.viewBox.join(' ')

const rows = []
for (const [fromName, toName] of fixtures.pairs) {
  const name = `${fromName} → ${toName}`
  if (filter && !name.includes(filter)) continue
  const prepared = prepare(fixtures.shapes[fromName], fixtures.shapes[toName])
  const mix = interpolate(prepared)
  const open = prepared.layout.some((value, i) => i % 2 === 1 && value === 0)
  const style = open
    ? 'fill="none" stroke="#1f2937" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="#4f46e5" fill-rule="nonzero"'

  const cells = frames.map(
    (t) =>
      `<figure><svg viewBox="${viewBox}"><path d="${mix(t)}" ${style}/></svg><figcaption>t = ${t}</figcaption></figure>`,
  )
  cells.push(
    `<figure><svg viewBox="${viewBox}">${correspondence(prepared)}</svg><figcaption>points: ${prepared.from.length / 2}</figcaption></figure>`,
  )
  rows.push(`<section><h2>${name}</h2><div class="frames">${cells.join('')}</div></section>`)
}

/** Source (blue) and target (orange) outlines, with lines between paired anchors. */
function correspondence({ layout, from, to }) {
  const lines = []
  const dots = []
  let start = 0
  for (let s = 0; s < layout.length; s += 2) {
    const end = start + 2 + 6 * layout[s]
    for (let i = start; i < end; i += 6) {
      lines.push(`M${from[i]} ${from[i + 1]}L${to[i]} ${to[i + 1]}`)
      dots.push(`<circle cx="${from[i]}" cy="${from[i + 1]}" r="1.4" fill="#2563eb"/>`)
      dots.push(`<circle cx="${to[i]}" cy="${to[i + 1]}" r="1.4" fill="#ea580c"/>`)
    }
    start = end
  }
  const outline = (points) => {
    let d = ''
    let o = 0
    for (let s = 0; s < layout.length; s += 2) {
      const end = o + 2 + 6 * layout[s]
      d += `M${points[o]} ${points[o + 1]}C${points.slice(o + 2, end).join(' ')}`
      if (layout[s + 1]) d += 'Z'
      o = end
    }
    return d
  }
  return [
    `<path d="${outline(from)}" fill="none" stroke="#93c5fd" stroke-width="1.5"/>`,
    `<path d="${outline(to)}" fill="none" stroke="#fdba74" stroke-width="1.5"/>`,
    `<path d="${lines.join('')}" stroke="#9ca3af" stroke-width="0.6"/>`,
    ...dots,
  ].join('')
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>morphfx filmstrip</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; margin: 24px; color: #111827; background: #fff; }
  h1 { font-size: 18px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .frames { display: flex; gap: 8px; }
  figure { margin: 0; text-align: center; }
  svg { width: 120px; height: 120px; border: 1px solid #e5e7eb; border-radius: 6px; }
  figcaption { color: #6b7280; font-size: 11px; }
</style>
<h1>morphfx filmstrip (${rows.length} pairs)</h1>
${rows.join('\n')}
`

mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'index.html'), html)
console.log(`Wrote ${rows.length} filmstrips to ${join(output, 'index.html')}`)
