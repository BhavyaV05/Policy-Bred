import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Card, Field, LabeledScale, NumberScale, Notice, RadioList } from '../../components/ui'
import { FRAMING_CHECK_LABELS, MAJORITY_RECALL_OPTIONS, RECONSIDER_CHECK_OPTIONS } from '../../content/instrument'
import type { StepProps } from '../ParticipantApp'

export function ManipulationChecks({ token, busy, error, act, setProgress }: StepProps) {
  const [framing, setFraming] = useState<number | null>(null)
  const [recall, setRecall] = useState<string | null>(null)
  const [social, setSocial] = useState<number | null>(null)
  const [pres, setPres] = useState<number | null>(null)
  const [recon, setRecon] = useState<string | null>(null)
  const n = [framing, recall, social, pres, recon].filter((v) => v != null).length
  useEffect(() => setProgress(n / 5), [n, setProgress])

  return (
    <div className="fade-in">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">A Few Questions About Your Experience</h1>
        <div className="mt-6 divide-y divide-slate-100">
          <Field label="How positively or negatively was the information about the policies presented?" required>
            <LabeledScale name="m1" labels={FRAMING_CHECK_LABELS} value={framing} onChange={setFraming} legend="Positive or negative presentation" />
          </Field>
          <Field label="What did the additional information suggest about the opinions of other students?" required>
            <RadioList name="m2" legend="Other students' opinions" options={MAJORITY_RECALL_OPTIONS} value={recall} onChange={setRecall} />
          </Field>
          <Field label="To what extent did the information about other students' opinions influence your evaluation of the policies?" required>
            <NumberScale name="m3" max={7} low="Not at all" high="To a very great extent" value={social} onChange={setSocial} legend="Influence of others' opinions" />
          </Field>
          <Field label="To what extent did the way the policies were presented influence your evaluation of them?" required>
            <NumberScale name="m4" max={7} low="Not at all" high="To a very great extent" value={pres} onChange={setPres} legend="Influence of presentation" />
          </Field>
          <Field label="Did you find yourself reconsidering any of your initial policy preferences after reading the additional information?" required>
            <RadioList name="m5" legend="Reconsidering" options={RECONSIDER_CHECK_OPTIONS} value={recon} onChange={setRecon} />
          </Field>
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex sm:justify-end">
          <Button
            className="w-full sm:w-auto" disabled={busy || n < 5}
            onClick={() => act(() => api.submitManipulationChecks(token, {
              perceived_framing: framing, recalled_majority_opinion: recall, perceived_social_influence: social,
              perceived_framing_influence: pres, reconsideration_check: recon,
            }))}
          >
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
