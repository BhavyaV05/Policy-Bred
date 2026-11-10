import { useEffect, useState } from 'react'
import { api, type Policy } from '../../lib/api'
import { Button, Card, Field, LabeledScale, NumberScale, Notice } from '../../components/ui'
import { SUPPORT_LABELS } from '../../content/instrument'
import type { StepProps } from '../ParticipantApp'

interface A { support: number | null; confidence: number | null; familiarity: number | null }

export function PolicyCard({ policy, index, total }: { policy: Policy; index: number; total: number }) {
  return (
    <div className="rounded-xl border border-accent-200 bg-accent-50 p-5 sm:p-6">
      <div className="text-xs font-medium tracking-wide text-accent-700 uppercase">Policy {index + 1} of {total}</div>
      <h2 className="mt-1 text-xl font-semibold text-slate-900">{policy.title}</h2>
      <div className="mt-4 rounded-lg bg-white p-4 sm:p-5">
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Proposed policy</div>
        <p className="mt-2 text-base leading-relaxed text-slate-800 sm:text-lg">&ldquo;{policy.description}&rdquo;</p>
      </div>
    </div>
  )
}

export function Pretest({ token, state, policies, busy, error, act, setProgress }: StepProps) {
  const order = state.policy_order ?? []
  const startPos = (state.position ?? 1) - 1
  const [intro, setIntro] = useState(startPos === 0)
  const [idx, setIdx] = useState(Math.min(startPos, 4))
  const [answers, setAnswers] = useState<Record<number, A>>(() => {
    const m: Record<number, A> = {}
    for (const p of state.pre_answers ?? []) m[p.policy_id] = { support: p.support, confidence: p.confidence, familiarity: p.familiarity }
    return m
  })
  useEffect(() => setProgress(0), [idx, setProgress])

  if (intro) {
    return (
      <div className="fade-in">
        <Card>
          <h1 className="text-2xl font-semibold text-slate-900">Your Initial Opinions on University Policies</h1>
          <div className="mt-5 space-y-3 text-base leading-relaxed text-slate-700">
            <p>The following section presents five hypothetical university policy proposals.</p>
            <p>Please read each proposal carefully and indicate your personal level of support or opposition.</p>
            <p>There are no right or wrong answers. We are interested in your individual opinions and preferences.</p>
            <p>Please respond based on your current views, without overthinking your answers.</p>
          </div>
          <div className="mt-8"><Button onClick={() => setIntro(false)} className="w-full sm:w-auto">Continue</Button></div>
        </Card>
      </div>
    )
  }

  const policy = policies.find((p) => p.policy_id === order[idx])
  if (!policy) return null
  const a = answers[policy.policy_id] ?? { support: null, confidence: null, familiarity: null }
  const set = (patch: Partial<A>) => setAnswers((m) => ({ ...m, [policy.policy_id]: { ...a, ...patch } }))

  const next = async () => {
    const ok = await act(() => api.savePolicyResponse(token, 'pre', policy.policy_id, a.support!, a.confidence, a.familiarity))
    if (ok) setIdx(Math.min(idx + 1, 4))
  }

  return (
    <div className="fade-in space-y-5" key={policy.policy_id}>
      <Card>
        <PolicyCard policy={policy} index={idx} total={order.length} />
        <div className="mt-6 divide-y divide-slate-100">
          <Field label="To what extent do you support or oppose the introduction of this policy at your university?" required>
            <LabeledScale name={`s-${policy.policy_id}`} labels={SUPPORT_LABELS} value={a.support} onChange={(v) => set({ support: v })} legend="Support or oppose" />
          </Field>
          <Field label="How confident are you about your opinion on this policy?" optional>
            <NumberScale name={`c-${policy.policy_id}`} max={7} low="Not at all confident" high="Extremely confident" value={a.confidence} onChange={(v) => set({ confidence: v })} legend="Confidence" />
          </Field>
          <Field label="How familiar are you with the issue addressed by this policy?" optional>
            <NumberScale name={`f-${policy.policy_id}`} max={5} low="Not at all familiar" high="Extremely familiar" value={a.familiarity} onChange={(v) => set({ familiarity: v })} legend="Familiarity" />
          </Field>
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {idx > 0 ? <Button variant="secondary" disabled={busy} onClick={() => setIdx(idx - 1)}>Back</Button> : <span />}
          <Button disabled={busy || a.support == null} onClick={next}>{busy ? 'Saving…' : 'Continue'}</Button>
        </div>
      </Card>
    </div>
  )
}
