import { useState } from 'react'
import { api } from '../../lib/api'
import { Button, Card, Notice } from '../../components/ui'
import type { StepProps } from '../ParticipantApp'

export function Debrief({ token, busy, error, act }: StepProps) {
  const [comment, setComment] = useState('')
  return (
    <div className="fade-in">
      <Card>
        <h1 className="text-2xl font-semibold text-slate-900">Thank you for participating in this study!</h1>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-slate-700">
          <p>
            The purpose of this research is to examine how the presentation of university policies and perceived
            opinions of others can influence individual policy preferences.
          </p>
          <p>
            Throughout the questionnaire, participants were randomly assigned to different experimental conditions.
            Depending on their assigned condition, they were shown either positively or negatively framed descriptions
            of the policies, along with information suggesting that a majority of students supported or opposed the
            policies.
          </p>
          <p>
            These majority-opinion statements were hypothetical and were used solely for experimental purposes. They were
            not based on actual survey findings or verified opinions of university students.
          </p>
          <p>
            By comparing participants&rsquo; initial and final responses, the study aims to understand the potential
            influence of policy framing and perceived social conformity on individual decision-making.
          </p>
          <p>
            Your participation is greatly appreciated. All responses will be treated confidentially and used only for
            academic research purposes.
          </p>
          <p className="font-medium text-slate-900">Thank you for your time and contribution!</p>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <label htmlFor="comment" className="block text-base font-medium text-slate-900">
            Would you like to provide any additional comments about the questionnaire or the policies presented?
            <span className="ml-2 text-xs font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4}
            className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <p className="mt-1 text-xs text-slate-500">Please do not include your name or other identifying information.</p>
        </div>

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex sm:justify-end">
          <Button className="w-full sm:w-auto" disabled={busy} onClick={() => act(() => api.completeStudy(token, comment))}>
            {busy ? 'Submitting…' : 'Submit my responses'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
