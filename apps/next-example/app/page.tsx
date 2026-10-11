import { MorphPath } from '@morphfx/react'
import { PlayPause } from './play-pause'
import { Scrubber } from './scrubber'
import { ShapeCycler } from './shape-cycler'
import { shapes } from './shapes'

// A Server Component: the client components below hydrate on their own.
export default function Page() {
  return (
    <main>
      <h1>morphfx + Next.js</h1>

      <section>
        <h2>Toggle</h2>
        <p>Click to switch shapes. Click again mid-morph to reverse it smoothly.</p>
        <PlayPause />
      </section>

      <section>
        <h2>Interrupt</h2>
        <p>Each click morphs to the next shape, starting from whatever is on screen.</p>
        <ShapeCycler />
      </section>

      <section>
        <h2>Controlled progress</h2>
        <p>The slider drives the progress through four shapes; nothing animates on its own.</p>
        <Scrubber />
      </section>

      <section>
        <h2>From a Server Component</h2>
        <p>Rendered on the server: the path data is in the HTML before any JavaScript runs.</p>
        <svg viewBox="0 0 100 100" width={96} height={96} role="img" aria-label="Heart">
          <MorphPath d={shapes.heart} fill="#e11d48" />
        </svg>
      </section>
    </main>
  )
}
