'use client'

import { MorphPath } from '@morphfx/react'
import { useState } from 'react'
import { shapes } from './shapes'

export function PlayPause() {
  const [playing, setPlaying] = useState(false)
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={playing ? 'Pause' : 'Play'}
      onClick={() => setPlaying((value) => !value)}
    >
      <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden="true">
        <MorphPath
          d={playing ? shapes.pause : shapes.play}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
          fill="currentColor"
        />
      </svg>
    </button>
  )
}
