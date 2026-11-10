import { useState } from 'react'
import { Button, Card, Notice } from '../../components/ui'
import { config } from '../../config'

export function Welcome({
  busy, error, onBegin, onResume,
}: { busy: boolean; error: string | null; onBegin: () => void; onResume: (code: string) => void }) {
  const [showResume, setShowResume] = useState(false)
  const [code, setCode] = useState('')
  return (
    <div className="fade-in space-y-6">
      <Card>
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Welcome</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Thank you for your interest in this academic research study about university students&rsquo; opinions on
          academic and campus policies.
        </p>
        <p className="mt-3 text-base leading-relaxed text-slate-700">
          It takes approximately {config.estimatedMinutes} minutes. You will first be shown a Participant Information Sheet
          that explains the study. Please use a desktop, tablet or phone and complete it in one sitting if you can.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          The study is anonymous: we do not ask for your name, roll number, email address or phone number.
        </p>
        {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-8"><Button onClick={onBegin} disabled={busy} className="w-full sm:w-auto">{busy ? 'Please wait…' : 'Continue'}</Button></div>
      </Card>

      <div className="text-center text-sm text-slate-500">
        {!showResume ? (
          <button className="underline underline-offset-2 hover:text-slate-700" onClick={() => setShowResume(true)}>
            I already started — resume with my code
          </button>
        ) : (
          <Card className="!p-5 text-left">
            <label htmlFor="resume" className="text-sm font-medium text-slate-800">Anonymous resume code</label>
            <input
              id="resume" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
            />
            <div className="mt-3 flex gap-3">
              <Button onClick={() => onResume(code)} disabled={busy || code.replace(/[^0-9a-fA-F]/g, '').length < 32}>Resume</Button>
              <Button variant="secondary" onClick={() => setShowResume(false)}>Cancel</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
