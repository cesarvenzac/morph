'use client'

import { MorphPath } from '@morphfx/react'
import { useState } from 'react'
import { shapes } from './shapes'

const cycle = ['circle', 'square', 'star', 'heart', 'ring'] as const

export function ShapeCycler() {
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState(0)
  const name = cycle[index % cycle.length]
  return (
    <div className="row">
      <button
        type="button"
        className="icon-button"
        aria-label={`Shape: ${name}. Click for the next one.`}
        onClick={() => setIndex((value) => value + 1)}
      >
        <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden="true">
          <MorphPath
            d={shapes[name]}
            fill="#4f46e5"
            onMorphComplete={() => setCompleted((value) => value + 1)}
          />
        </svg>
      </button>
      <output>
        {name} · {completed} morph{completed === 1 ? '' : 's'} completed
      </output>
    </div>
  )
}
