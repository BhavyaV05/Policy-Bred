import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Card, Field, Notice, RadioList } from '../../components/ui'
import { config } from '../../config'
import type { StepProps } from '../ParticipantApp'

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
const CONSENT = [
  { value: 'yes', label: 'Yes, I consent to participate.' },
  { value: 'no', label: 'No, I do not consent to participate.' },
]

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-7 mb-2 text-lg font-semibold text-slate-900">{children}</h2>
}

export function Consent({ token, busy, error, act, setProgress }: StepProps) {
  const [read, setRead] = useState<string | null>(null)
  const [vol, setVol] = useState<string | null>(null)
  const [age, setAge] = useState<string | null>(null)
  const done = [read, vol, age].filter(Boolean).length
  useEffect(() => setProgress(done / 3), [done, setProgress])

  return (
    <div className="fade-in space-y-6">
      <Card>
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Participant Information Sheet</h1>
        <div className="mt-6 space-y-1 text-base leading-relaxed text-slate-700">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Study Title</h2>
          <p>{config.studyTitle}.</p>

          <H>Purpose of the Study</H>
          <p>
            You are invited to participate in an academic research study examining how the presentation of university
            policies and information about other students&rsquo; opinions may influence individual policy preferences.
          </p>
          <p className="mt-3">
            The study will examine students&rsquo; opinions on five proposed university policies relating to tutorials,
            examinations, academic assessments, class schedules and mess facilities.
          </p>

          <H>What will participation involve?</H>
          <p>If you agree to participate, you will be asked to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Provide some basic demographic and academic background information.</li>
            <li>Express your initial opinions on five proposed university policies.</li>
            <li>Complete a short visual activity.</li>
            <li>Read different descriptions of these policies and hypothetical information about other students&rsquo; opinions.</li>
            <li>Provide your opinions on the policies again.</li>
          </ul>
          <p className="mt-3">The questionnaire is expected to take approximately {config.estimatedMinutes} minutes.</p>

          <H>Voluntary Participation</H>
          <p>
            Participation is entirely voluntary. You may choose not to answer any question where permitted and may
            withdraw before submitting your responses without any penalty. A &ldquo;Withdraw from the study&rdquo; link is
            available at the bottom of every page. Because responses are anonymous, once you have submitted your final
            responses they cannot be linked back to you, so they may not be retrievable for withdrawal afterwards.
          </p>

          <H>Risks and Benefits</H>
          <p>
            The study involves minimal anticipated risk. Some questions may prompt you to reconsider your opinions about
            university policies. There is no guaranteed direct benefit from participating.
          </p>

          <H>Confidentiality</H>
          <p>
            Your responses will be used only for academic research. The research team will not disclose individual
            responses or identifying information. The questionnaire will avoid collecting direct identifiers.
          </p>

          <H>Research Contact</H>
          <p><span className="font-medium">Researcher:</span> {config.researcherName}</p>
          <p><span className="font-medium">Institution:</span> {config.institution}.</p>
          <p><span className="font-medium">Faculty Supervisor:</span> {config.supervisor}</p>
          {config.contactEmail && <p><span className="font-medium">Contact:</span> {config.contactEmail}</p>}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Consent</h2>
        <p className="mb-5 text-sm text-slate-500">All three questions are required to take part.</p>
        <Field label="1. Have you read and understood the participant information provided above?" required>
          <RadioList name="c1" legend="Read and understood" options={YES_NO} value={read} onChange={setRead} />
        </Field>
        <Field label="2. Do you voluntarily agree to participate in this research study?" required>
          <RadioList name="c2" legend="Voluntary agreement" options={CONSENT} value={vol} onChange={setVol} />
        </Field>
        <Field label="3. Do you confirm that you are at least 18 years old?" required>
          <RadioList name="c3" legend="At least 18" options={YES_NO} value={age} onChange={setAge} />
        </Field>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6">
          <Button
            disabled={busy || !read || !vol || !age}
            onClick={() => act(() => api.submitConsent(token, read === 'yes', vol === 'yes', age === 'yes'))}
            className="w-full sm:w-auto"
          >
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
