'use client'

import { MorphPath } from '@morphfx/react'
import { useState } from 'react'
import { shapes } from './shapes'

const paths = [shapes.circle, shapes.square, shapes.star, shapes.heart]

export function Scrubber() {
  const [progress, setProgress] = useState(0)
  return (
    <div className="row">
      <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden="true">
        <MorphPath paths={paths} progress={progress} fill="#0d9488" />
      </svg>
      <label>
        Progress
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
        />
        <output>{progress.toFixed(2)}</output>
      </label>
    </div>
  )
}
