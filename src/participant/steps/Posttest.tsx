import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Card, Field, LabeledScale, Notice } from '../../components/ui'
import { SUPPORT_LABELS } from '../../content/instrument'
import type { StepProps } from '../ParticipantApp'

// No Back button: post-test answers are final and the pre-test answers are never shown here.
export function Posttest({ token, state, policies, busy, error, act, setProgress }: StepProps) {
  const order = state.policy_order ?? []
  const pos = (state.position ?? 1) - 1
  const [intro, setIntro] = useState(pos === 0)
  const [value, setValue] = useState<number | null>(null)
  useEffect(() => { setValue(null); setProgress(0) }, [pos, setProgress])

  if (intro) {
    return (
      <div className="fade-in">
        <Card>
          <h1 className="text-2xl font-semibold text-slate-900">Your Final Opinions</h1>
          <p className="mt-5 text-base leading-relaxed text-slate-700">
            You have now read the descriptions and additional information about the five proposed university policies.
            Please indicate your current opinions on each policy based on the information you have considered.
          </p>
          <div className="mt-8"><Button onClick={() => setIntro(false)} className="w-full sm:w-auto">Continue</Button></div>
        </Card>
      </div>
    )
  }

  const policy = policies.find((p) => p.policy_id === order[pos])
  if (!policy) return null

  return (
    <div className="fade-in" key={policy.policy_id}>
      <Card>
        <div className="rounded-xl border border-accent-200 bg-accent-50 p-5 sm:p-6">
          <div className="text-xs font-medium tracking-wide text-accent-700 uppercase">Policy {pos + 1} of {order.length}</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{policy.title}</h2>
          <div className="mt-4 rounded-lg bg-white p-4 sm:p-5">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Proposed policy</div>
            <p className="mt-2 text-base leading-relaxed text-slate-800 sm:text-lg">&ldquo;{policy.description}&rdquo;</p>
          </div>
        </div>
        <div className="mt-6">
          <Field label="After considering the information presented, to what extent do you support or oppose the introduction of this policy at your university?" required>
            <LabeledScale name={`post-${policy.policy_id}`} labels={SUPPORT_LABELS} value={value} onChange={setValue} legend="Support or oppose" />
          </Field>
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex sm:justify-end">
          <Button className="w-full sm:w-auto" disabled={busy || value == null} onClick={() => act(() => api.savePolicyResponse(token, 'post', policy.policy_id, value!))}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
