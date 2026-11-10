import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Notice } from '../../components/ui'
import layout from '../../content/gameLayout.json'
import type { StepProps } from '../ParticipantApp'

interface Shape { type: string; x: number; y: number; r: number; rotation: number; color: string }
const STROKE = '#1f2937'

function ShapeSvg({ s }: { s: Shape }) {
  const t = `translate(${s.x} ${s.y}) rotate(${s.rotation})`
  const common = { fill: s.color, stroke: STROKE, strokeWidth: 2.5, strokeLinejoin: 'round' as const }
  if (s.type === 'circle') return <circle cx={s.x} cy={s.y} r={s.r} {...common} />
  if (s.type === 'square') { const h = s.r * 0.88; return <rect x={-h} y={-h} width={2 * h} height={2 * h} rx={2} transform={t} {...common} /> }
  if (s.type === 'triangle') {
    const pts = [0, 1, 2].map((i) => { const a = (-90 + i * 120) * Math.PI / 180; return `${(s.r * 1.12 * Math.cos(a)).toFixed(1)},${(s.r * 1.12 * Math.sin(a) + s.r * 0.12).toFixed(1)}` }).join(' ')
    return <polygon points={pts} transform={t} {...common} />
  }
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rad = i % 2 === 0 ? s.r * 1.15 : s.r * 0.5
    return `${(rad * Math.cos(a)).toFixed(1)},${(rad * Math.sin(a)).toFixed(1)}`
  }).join(' ')
  return <polygon points={pts} transform={t} {...common} />
}

export function Game({ token, state, busy, error, act, setProgress }: StepProps) {
  const [started, setStarted] = useState((state.game?.attempts ?? 0) > 0)
  const [vals, setVals] = useState({ c: '', t: '', s: '' })
  const [hint, setHint] = useState(false)
  const thanks = state.step === 'assign'

  // Once the activity is complete (or after a refresh at the hand-over point), continue automatically.
  useEffect(() => {
    if (state.step !== 'assign') return
    const force = (() => { try { const v = sessionStorage.getItem('bred.test.force.v1'); return v ? Number(v) : null } catch { return null } })()
    const timer = setTimeout(() => { void act(() => api.assignCondition(token, force)) }, 2200)
    return () => clearTimeout(timer)
  }, [state.step, act, token])

  useEffect(() => setProgress(0), [setProgress])

  const complete = vals.c !== '' && vals.t !== '' && vals.s !== ''
  const submit = async () => {
    setHint(false)
    const ok = await act(() => api.submitGame(token, Number(vals.c), Number(vals.t), Number(vals.s)))
    void ok
  }
  // After submit, `state.step` becomes 'assign' (done) or stays 'game' with last_attempt_correct === false.
  useEffect(() => { if (state.last_attempt_correct === false && state.step === 'game') setHint(true) }, [state])

  if (thanks) {
    return (
      <div className="fade-in rounded-2xl border border-dashed border-teal-300 bg-teal-50/60 p-8 text-center sm:p-12">
        <p className="text-xl font-semibold text-slate-800">Thank you! You can now proceed to the next section.</p>
        <p className="mt-3 text-sm text-slate-500">Continuing automatically…</p>
        {error && <div className="mt-5 text-left"><Notice tone="error">{error}</Notice><div className="mt-3"><Button disabled={busy} onClick={() => { void act(() => api.assignCondition(token, null)) }}>Continue</Button></div></div>}
      </div>
    )
  }

  return (
    <div className="fade-in rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/60 p-5 sm:p-8">
      <div className="text-xs font-medium tracking-wide text-teal-800 uppercase">Activity</div>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">A Short Visual Activity</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-700">
        Before proceeding to the next section, please complete the following short activity. This is a simple visual
        observation exercise. Carefully examine the image and answer the questions based on what you observe.
      </p>

      {!started ? (
        <div className="mt-8"><Button onClick={() => setStarted(true)} className="w-full sm:w-auto">Start activity</Button></div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-teal-200 bg-white p-2 sm:p-4">
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-auto w-full" role="img" aria-label="A collection of circles, triangles, squares and stars arranged on a white background">
              {(layout.shapes as Shape[]).map((s, i) => <ShapeSvg key={i} s={s} />)}
            </svg>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {([['c', 'How many circles are present?'], ['t', 'How many triangles are present?'], ['s', 'How many squares are present?']] as const).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-2 block text-base font-medium text-slate-900">{label}</span>
                <input
                  type="number" inputMode="numeric" min={0} max={99} step={1} value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg"
                />
              </label>
            ))}
          </div>
          {hint && !busy && (
            <div className="mt-5"><Notice tone="warn">Some of the counts do not match what is in the image. Please take another look and try again.</Notice></div>
          )}
          {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-6"><Button disabled={busy || !complete} onClick={submit} className="w-full sm:w-auto">{busy ? 'Checking…' : 'Submit answers'}</Button></div>
        </>
      )}
    </div>
  )
}
