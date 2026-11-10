import { useEffect, useState } from 'react'
import { api, ApiError, type Exposure } from '../../lib/api'
import { Button, Card, Notice } from '../../components/ui'
import type { StepProps } from '../ParticipantApp'

export function Manipulation({ token, state, busy, error, act, setProgress }: StepProps) {
  const position = state.position ?? 1
  const [intro, setIntro] = useState(position === 1)
  const [exp, setExp] = useState<Exposure | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => { setProgress(0) }, [position, setProgress])

  useEffect(() => {
    if (intro) return
    let cancelled = false
    setExp(null); setLoadErr(false)
    api.getExposure(token, position)
      .then((e) => { if (!cancelled) setExp(e) })
      .catch((e) => { if (!cancelled) setLoadErr(!(e instanceof ApiError) || e.code !== 'wrong_step') })
    return () => { cancelled = true }
  }, [intro, position, token, retry])

  if (intro) {
    return (
      <div className="fade-in">
        <Card>
          <h1 className="text-2xl font-semibold text-slate-900">More About the Policies</h1>
          <p className="mt-5 text-base leading-relaxed text-slate-700">
            In the following section, you will be presented with additional information about five university policy
            proposals. Please read each description carefully before responding.
          </p>
          <div className="mt-8"><Button onClick={() => setIntro(false)} className="w-full sm:w-auto">Continue</Button></div>
        </Card>
      </div>
    )
  }

  if (loadErr) {
    return (
      <Card>
        <Notice tone="error">We could not load this page. Your answers are safe — please try again.</Notice>
        <div className="mt-4"><Button onClick={() => setRetry((r) => r + 1)}>Try again</Button></div>
      </Card>
    )
  }
  if (!exp) return <p className="py-16 text-center text-slate-500">Loading…</p>

  return (
    <div className="fade-in" key={exp.position}>
      <Card>
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Policy {exp.position} of {exp.total}</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{exp.title}</h1>

        <section className="mt-6" aria-label="Proposed policy">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Proposed policy</div>
          <p className="mt-2 rounded-xl bg-slate-50 p-4 text-base leading-relaxed text-slate-800">&ldquo;{exp.description}&rdquo;</p>
        </section>

        <section className="mt-6" aria-label="Description of the policy">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Description</div>
          <p className="mt-2 text-lg leading-relaxed text-slate-900">{exp.framing_text}</p>
        </section>

        <section className="mt-6 border-l-4 border-accent-500 bg-accent-50 p-4 sm:p-5" aria-label="Information about other students">
          <div className="text-xs font-semibold tracking-wide text-accent-700 uppercase">Other students&rsquo; opinions (hypothetical)</div>
          <p className="mt-2 text-base leading-relaxed text-slate-800">{exp.majority_text}</p>
        </section>

        {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-8">
          <Button disabled={busy} onClick={() => act(() => api.completeExposure(token, exp.position))} className="w-full sm:w-auto">
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
