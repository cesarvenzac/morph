import { PathParseError, type PreparedMorph, parsePath, prepare } from '@morphfx/core'
import { MorphPath, type ReducedMotion, type Transition } from '@morphfx/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { presets, type Shape } from './shapes'

type Kind = 'spring' | 'tween'
type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

const sample = 'M50 8 C70 8 92 30 92 50 C92 74 72 92 50 92 C40 70 20 66 8 50 C20 34 40 30 50 8 Z'

export function App() {
  const [shape, setShape] = useState<Shape>(presets[0])
  const [previous, setPrevious] = useState<Shape>(presets[5])
  const [kind, setKind] = useState<Kind>('spring')
  const [duration, setDuration] = useState(0.6)
  const [bounce, setBounce] = useState(0.2)
  const [ease, setEase] = useState<Ease>('easeInOut')
  const [reducedMotion, setReducedMotion] = useState<ReducedMotion>('user')
  const [outline, setOutline] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [progress, setProgress] = useState(1)
  const [custom, setCustom] = useState(sample)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')
  const started = useRef(0)
  const timers = useRef<number[]>([])

  const transition: Transition =
    kind === 'spring' ? { type: 'spring', duration, bounce } : { type: 'tween', duration, ease }

  const go = (next: Shape): void => {
    if (next.d === shape.d) return
    setPrevious(shape)
    setShape(next)
    setProgress(1)
  }

  // Show what the tool does on first load: one morph from the circle to the star.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPrevious(presets[0])
      setShape(presets[5])
    }, 500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const rapidFire = (): void => {
    const others = presets.filter((p) => p.d !== shape.d)
    const picks = [0, 1, 2].map(() => others[Math.floor(Math.random() * others.length)])
    let current = shape
    picks.forEach((pick, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setPrevious(current)
          setShape(pick)
          current = pick
        }, i * 150),
      )
    })
  }

  const applyCustom = (): void => {
    const d = custom.trim()
    try {
      parsePath(d)
      if (d === '') throw new Error('Paste some path data first, for example M10 10 H90 V90 Z.')
      setError(null)
      go({ name: 'custom', label: 'Your shape', d })
    } catch (e) {
      setError(e instanceof PathParseError || e instanceof Error ? e.message : String(e))
    }
  }

  const stats = useMemo(() => {
    const start = performance.now()
    const prepared = prepare(previous.d, shape.d)
    return { prepared, time: performance.now() - start }
  }, [previous.d, shape.d])

  const paint = outline
    ? { fill: 'none', stroke: 'var(--shape)', strokeWidth: 2.5, strokeLinejoin: 'round' as const }
    : { fill: 'var(--shape)' }

  const options =
    kind === 'spring'
      ? [`type: 'spring'`, `duration: ${duration}`, `bounce: ${bounce}`]
      : [`type: 'tween'`, `duration: ${duration}`, `ease: '${ease}'`]
  const code = [
    '<MorphPath',
    `  d={${shape.name === 'custom' ? 'yourShape' : camel(shape.name)}}`,
    '  transition={{',
    ...options.map((option) => `    ${option},`),
    '  }}',
    '/>',
  ].join('\n')

  return (
    <div className="page">
      <header className="masthead">
        <h1>
          morphfx <span>playground</span>
        </h1>
        <p>
          Pick shapes to morph between, interrupt them mid-flight, and tune the motion. Every frame
          is <code>@morphfx/react</code> running in your browser.
        </p>
      </header>

      <main className="layout">
        <section className="stage-column" aria-label="Morph">
          <div className="stage">
            <svg viewBox="-8 -8 116 116" role="img" aria-label={`Shape: ${shape.label}`}>
              <Grid />
              {scrubbing ? (
                <MorphPath paths={[previous.d, shape.d]} progress={progress} {...paint} />
              ) : (
                <MorphPath
                  d={shape.d}
                  transition={transition}
                  reducedMotion={reducedMotion}
                  onMorphStart={() => {
                    started.current = performance.now()
                    setStatus('Morphing…')
                  }}
                  onMorphComplete={() => {
                    const elapsed = Math.round(performance.now() - started.current)
                    setStatus(`Settled in ${elapsed} ms`)
                  }}
                  {...paint}
                />
              )}
              {pairing && <Pairing prepared={stats.prepared} />}
            </svg>
            <p className="readout" aria-live="polite">
              <span>
                {previous.label} → {shape.label}
              </span>
              <span>{scrubbing ? `t = ${progress.toFixed(2)}` : status}</span>
            </p>
          </div>

          <fieldset className="tray">
            <legend>Shapes</legend>
            <div className="tray-grid">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="swatch"
                  aria-pressed={preset.d === shape.d}
                  onClick={() => go(preset)}
                >
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <path d={preset.d} />
                  </svg>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <button type="button" className="action" onClick={rapidFire}>
                Interrupt test
              </button>
              <span className="hint">Morphs to 3 random shapes, 150 ms apart.</span>
            </div>
          </fieldset>
        </section>

        <aside className="controls">
          <fieldset>
            <legend>Motion</legend>
            <div className="segmented">
              {(['spring', 'tween'] as const).map((value) => (
                <label key={value} htmlFor={`kind-${value}`}>
                  <input
                    id={`kind-${value}`}
                    type="radio"
                    name="kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                  />
                  {value === 'spring' ? 'Spring' : 'Tween'}
                </label>
              ))}
            </div>
            <label className="slider" htmlFor="duration">
              <span>Duration</span>
              <input
                id="duration"
                type="range"
                min={0.1}
                max={2}
                step={0.05}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
              <output>{duration.toFixed(2)} s</output>
            </label>
            {kind === 'spring' ? (
              <label className="slider" htmlFor="bounce">
                <span>Bounce</span>
                <input
                  id="bounce"
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={bounce}
                  onChange={(e) => setBounce(Number(e.target.value))}
                />
                <output>{bounce.toFixed(2)}</output>
              </label>
            ) : (
              <label className="field" htmlFor="ease">
                <span>Easing</span>
                <select id="ease" value={ease} onChange={(e) => setEase(e.target.value as Ease)}>
                  <option value="linear">linear</option>
                  <option value="easeIn">easeIn</option>
                  <option value="easeOut">easeOut</option>
                  <option value="easeInOut">easeInOut</option>
                </select>
              </label>
            )}
            <label className="field" htmlFor="reduced-motion">
              <span>Reduced motion</span>
              <select
                id="reduced-motion"
                value={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.value as ReducedMotion)}
              >
                <option value="user">Follow system setting</option>
                <option value="always">Always (no animation)</option>
                <option value="never">Never (always animate)</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Inspect</legend>
            <label className="check" htmlFor="pairing">
              <input
                id="pairing"
                type="checkbox"
                checked={pairing}
                onChange={(e) => setPairing(e.target.checked)}
              />
              Show point pairing
            </label>
            <label className="check" htmlFor="scrub">
              <input
                id="scrub"
                type="checkbox"
                checked={scrubbing}
                onChange={(e) => {
                  setScrubbing(e.target.checked)
                  setProgress(e.target.checked ? 0.5 : 1)
                }}
              />
              Scrub the last morph by hand
            </label>
            {scrubbing && (
              <label className="slider" htmlFor="progress">
                <span>Progress</span>
                <input
                  id="progress"
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
                <output>{progress.toFixed(2)}</output>
              </label>
            )}
            <label className="check" htmlFor="outline">
              <input
                id="outline"
                type="checkbox"
                checked={outline}
                onChange={(e) => setOutline(e.target.checked)}
              />
              Draw as outline
            </label>
            <dl className="stats">
              <div>
                <dt>Segments</dt>
                <dd>{stats.prepared.layout.reduce((n, v, i) => (i % 2 ? n : n + v), 0)}</dd>
              </div>
              <div>
                <dt>Pieces</dt>
                <dd>{stats.prepared.layout.length / 2}</dd>
              </div>
              <div>
                <dt>Prepare</dt>
                <dd>{stats.time.toFixed(2)} ms</dd>
              </div>
            </dl>
          </fieldset>

          <fieldset>
            <legend>Your own shape</legend>
            <label className="field" htmlFor="custom">
              <span>
                SVG path data in a <code>0 0 100 100</code> viewBox
              </span>
              <textarea
                id="custom"
                rows={4}
                spellCheck={false}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="action" onClick={applyCustom}>
              Morph to this path
            </button>
          </fieldset>

          <fieldset>
            <legend>Code</legend>
            <CodeBlock code={code} />
          </fieldset>
        </aside>
      </main>
    </div>
  )
}

/** The viewBox coordinate grid, labelled like a vector editor's rulers. */
function Grid() {
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  return (
    <g className="grid">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={v} y1={0} x2={v} y2={100} className={v % 50 === 0 ? 'major' : undefined} />
          <line x1={0} y1={v} x2={100} y2={v} className={v % 50 === 0 ? 'major' : undefined} />
        </g>
      ))}
      {[0, 50, 100].map((v) => (
        <g key={`label-${v}`}>
          <text x={v} y={-3} textAnchor="middle">
            {v}
          </text>
          <text x={-3} y={v + 1.2} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Source anchors (blue), target anchors (orange) and the lines pairing them. */
function Pairing({ prepared }: { prepared: PreparedMorph }) {
  const { layout, from, to } = prepared
  const anchors: { fx: number; fy: number; tx: number; ty: number }[] = []
  let start = 0
  for (let s = 0; s < layout.length; s += 2) {
    const end = start + 2 + 6 * layout[s]
    for (let i = start; i < end; i += 6) {
      anchors.push({ fx: from[i], fy: from[i + 1], tx: to[i], ty: to[i + 1] })
    }
    start = end
  }
  return (
    <g className="pairing">
      {anchors.map((a, i) => (
        <line key={`l${i}`} x1={a.fx} y1={a.fy} x2={a.tx} y2={a.ty} />
      ))}
      {anchors.map((a, i) => (
        <rect
          key={`f${i}`}
          className="from"
          x={a.fx - 1.1}
          y={a.fy - 1.1}
          width={2.2}
          height={2.2}
        />
      ))}
      {anchors.map((a, i) => (
        <rect key={`t${i}`} className="to" x={a.tx - 1.1} y={a.ty - 1.1} width={2.2} height={2.2} />
      ))}
    </g>
  )
}

function CodeBlock({ code }: { code: string }) {
  const block = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => {
        // Clipboard refused: select the text so it can be copied by hand.
        const selection = window.getSelection()
        if (block.current && selection) {
          const range = document.createRange()
          range.selectNodeContents(block.current)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      })
  }
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <div className="code">
      <pre ref={block}>{code}</pre>
      <button type="button" className="action" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function camel(name: string): string {
  return name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
}
