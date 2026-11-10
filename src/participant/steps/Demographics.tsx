import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { session, formatToken } from '../../lib/session'
import { Button, Card, Field, NumberScale, Notice, RadioList } from '../../components/ui'
import { DEMOGRAPHIC_GROUPS, type DemoQuestion } from '../../content/instrument'
import type { StepProps } from '../ParticipantApp'

type Answers = Record<string, any>

function isAnswered(q: DemoQuestion, a: Answers): boolean {
  if (q.kind === 'number') {
    const v = a[q.id]
    return v !== undefined && v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0
  }
  if (q.kind === 'scale7') return a[q.id] != null || (q.naId ? a[q.naId] === true : false)
  return a[q.id] != null && a[q.id] !== ''
}

export function Demographics({ token, busy, error, act, setProgress }: StepProps) {
  const [group, setGroup] = useState(0)
  const [a, setA] = useState<Answers>(() => session.getDraft<Answers>() ?? {})
  const g = DEMOGRAPHIC_GROUPS[group]
  const last = group === DEMOGRAPHIC_GROUPS.length - 1
  const [showCode, setShowCode] = useState(true)

  useEffect(() => { session.setDraft(a) }, [a])           // survive refreshes before submission
  useEffect(() => setProgress(group / DEMOGRAPHIC_GROUPS.length), [group, setProgress])

  const set = (id: string, v: unknown) => setA((p) => ({ ...p, [id]: v }))
  const visible = g.questions.filter((q) => q.kind !== 'radio' || !q.showIf || q.showIf(a))
  const ok = visible.every((q) => !q.required || isAnswered(q, a))
  const ageNum = Number(a.age)
  const ageBad = a.age !== undefined && a.age !== '' && (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120)

  const submit = async () => {
    const payload: Answers = {}
    for (const grp of DEMOGRAPHIC_GROUPS) {
      for (const q of grp.questions) {
        if (q.kind === 'radio' && q.showIf && !q.showIf(a)) continue
        if (a[q.id] !== undefined && a[q.id] !== '') payload[q.id] = a[q.id]
        if (q.kind === 'scale7' && q.naId && a[q.naId] === true) payload[q.naId] = true
      }
    }
    if (payload.age !== undefined) payload.age = Number(payload.age)
    if (payload.gender === 'self_describe' && a.gender_self_description) payload.gender_self_description = a.gender_self_description
    if (await act(() => api.submitDemographics(token, payload))) session.clearDraft()
  }

  return (
    <div className="fade-in space-y-4">
      {group === 0 && showCode && (
        <Notice>
          <div className="flex items-start justify-between gap-3">
            <span>
              Your progress is saved automatically. To continue later on another device, use the anonymous resume code
              (link at the bottom of the page): <span className="font-mono">{formatToken(token).slice(0, 9)}…</span>
            </span>
            <button className="shrink-0 text-xs underline" onClick={() => setShowCode(false)}>Dismiss</button>
          </div>
        </Notice>
      )}
      <Card>
        <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Background · {group + 1} of {DEMOGRAPHIC_GROUPS.length}</div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{g.title}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">{g.blurb} Questions marked <span className="text-rose-600">*</span> are required; all others are optional.</p>

        <div className="divide-y divide-slate-100">
          {visible.map((q) => (
            <Field key={q.id} label={q.label} required={q.required} optional={!q.required}>
              {q.kind === 'number' && (
                <div>
                  <input
                    type="number" inputMode="numeric" min={q.min} max={q.max} step={1}
                    value={a[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)}
                    aria-invalid={ageBad} aria-label={q.label}
                    className="w-32 rounded-xl border border-slate-300 px-4 py-3 text-lg"
                  />
                  {ageBad && <p className="mt-2 text-sm text-rose-700">Please enter your age as a whole number.</p>}
                </div>
              )}
              {q.kind === 'radio' && (
                <div>
                  <RadioList name={q.id} legend={q.label} options={q.options} value={a[q.id]} onChange={(v) => set(q.id, v)} />
                  {q.id === 'gender' && a.gender === 'self_describe' && (
                    <input
                      type="text" maxLength={100} value={a.gender_self_description ?? ''} placeholder="Please describe (optional)"
                      onChange={(e) => set('gender_self_description', e.target.value)} aria-label="Self-described gender"
                      className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3"
                    />
                  )}
                  {!q.required && a[q.id] != null && (
                    <button className="mt-2 text-xs text-slate-500 underline" onClick={() => set(q.id, undefined)}>Clear my answer</button>
                  )}
                </div>
              )}
              {q.kind === 'scale7' && (
                <div>
                  <NumberScale
                    name={q.id} max={7} low={q.low} high={q.high} legend={q.label}
                    value={a[q.id]} onChange={(v) => setA((p) => ({ ...p, [q.id]: v, ...(q.naId ? { [q.naId]: false } : {}) }))}
                  />
                  {q.naId && (
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-base">
                      <input
                        type="checkbox" checked={a[q.naId] === true} className="h-5 w-5 accent-[#2f5f9e]"
                        onChange={(e) => setA((p) => ({ ...p, [q.naId!]: e.target.checked, [q.id]: e.target.checked ? undefined : p[q.id] }))}
                      />
                      Not applicable
                    </label>
                  )}
                </div>
              )}
            </Field>
          ))}
        </div>

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {group > 0 ? <Button variant="secondary" onClick={() => setGroup(group - 1)} disabled={busy}>Back</Button> : <span />}
          {last ? (
            <Button disabled={busy || !ok || ageBad} onClick={submit}>{busy ? 'Saving…' : 'Continue'}</Button>
          ) : (
            <Button disabled={!ok || ageBad} onClick={() => { setGroup(group + 1); window.scrollTo({ top: 0 }) }}>Next</Button>
          )}
        </div>
      </Card>
    </div>
  )
}
