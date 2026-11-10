import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Card, Field, NumberScale, Notice, RadioList } from '../../components/ui'
import { FACTOR_OPTIONS, RECONSIDERATION_OPTIONS } from '../../content/instrument'
import type { StepProps } from '../ParticipantApp'

export function PostSupplementary({ token, busy, error, act, setProgress }: StepProps) {
  const [conf, setConf] = useState<number | null>(null)
  const [recon, setRecon] = useState<string | null>(null)
  const [factor, setFactor] = useState<string | null>(null)
  const n = [conf, recon, factor].filter((v) => v != null).length
  useEffect(() => setProgress(n / 3), [n, setProgress])

  return (
    <div className="fade-in">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">A few more questions about your opinions</h1>
        <div className="mt-6 divide-y divide-slate-100">
          <Field label="How confident are you about your final opinions on these policies?" required>
            <NumberScale name="fc" max={7} low="Not at all confident" high="Extremely confident" value={conf} onChange={setConf} legend="Final confidence" />
          </Field>
          <Field label="Did any of the information presented make you reconsider your initial opinion on any of the policies?" required>
            <RadioList name="rc" legend="Reconsidered" options={RECONSIDERATION_OPTIONS} value={recon} onChange={setRecon} />
          </Field>
          <Field label="Which factor influenced your final opinions the most?" required>
            <RadioList name="fa" legend="Most influential factor" options={FACTOR_OPTIONS} value={factor} onChange={setFactor} />
          </Field>
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex sm:justify-end">
          <Button className="w-full sm:w-auto" disabled={busy || conf == null || !recon || !factor} onClick={() => act(() => api.submitPosttestSupplementary(token, conf!, recon!, factor!))}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
