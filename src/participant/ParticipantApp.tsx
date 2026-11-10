import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, onNetworkStatus, type ParticipantState, type Policy } from '../lib/api'
import { session, formatToken } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, ProgressBar } from '../components/ui'
import { Welcome } from './steps/Welcome'
import { Consent } from './steps/Consent'
import { Demographics } from './steps/Demographics'
import { Pretest } from './steps/Pretest'
import { Game } from './steps/Game'
import { Manipulation } from './steps/Manipulation'
import { Posttest } from './steps/Posttest'
import { PostSupplementary } from './steps/PostSupplementary'
import { ManipulationChecks } from './steps/ManipulationChecks'
import { Debrief } from './steps/Debrief'
import { Ended } from './steps/Ended'

export interface StepProps {
  token: string
  state: ParticipantState
  policies: Policy[]
  busy: boolean
  error: string | null
  act: (fn: () => Promise<ParticipantState>) => Promise<boolean>
  setProgress: (extra: number) => void   // 0..1 progress within the current step
}

const ERROR_TEXT: Record<string, string> = {
  network: 'We could not reach the server. Your answers so far are saved. Please check your connection and press the button again.',
  server_error: 'Something went wrong on our side. Your earlier answers are safe. Please try again in a moment.',
  invalid_input: 'One of your answers could not be accepted. Please check the highlighted question and try again.',
  already_recorded: 'That answer was already recorded.',
  out_of_sequence: 'Please continue from where you left off.',
}

/** Overall progress (0-100) from the server-reported step and position, plus in-step progress. */
function overallProgress(s: ParticipantState, extra: number): number {
  const seg = (from: number, to: number, f: number) => from + (to - from) * Math.max(0, Math.min(1, f))
  switch (s.step) {
    case 'consent': return seg(0, 4, extra)
    case 'demographics': return seg(4, 14, extra)
    case 'pretest': return seg(14, 36, (s.pre_completed + extra) / 5)
    case 'game': return seg(36, 46, extra)
    case 'assign': return 46
    case 'manipulation': return seg(46, 66, (s.exposures_completed + extra) / 5)
    case 'posttest': return seg(66, 86, (s.post_completed + extra) / 5)
    case 'posttest_extra': return seg(86, 91, extra)
    case 'checks': return seg(91, 97, extra)
    case 'debrief': return seg(97, 99, extra)
    case 'done': return 100
    default: return 0
  }
}

export default function ParticipantApp() {
  const [phase, setPhase] = useState<'loading' | 'welcome' | 'active' | 'fatal'>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<ParticipantState | null>(null)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [extra, setExtra] = useState(0)
  const [testMode, setTestMode] = useState(session.getForce() !== null)
  const [panel, setPanel] = useState<null | 'withdraw' | 'code'>(null)
  const startedRef = useRef(false)

  useEffect(() => onNetworkStatus((s) => setOffline(s === 'retrying')), [])

  // ---- boot: policies, optional researcher test link, saved session ----------------------
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        // Researcher test link (?test_group=1..4): only honoured when a researcher is signed in on this browser.
        const params = new URLSearchParams(window.location.search)
        const tg = Number(params.get('test_group'))
        if (tg >= 1 && tg <= 4) {
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            session.clear()
            session.setForce(tg)
            setTestMode(true)
          }
          window.history.replaceState({}, '', window.location.pathname + window.location.hash)
        }
        const pol = await api.getPolicies()
        setPolicies(pol)
        const saved = session.get()
        if (saved) {
          try {
            const st = await api.getState(saved)
            setToken(saved); setState(st); setPhase('active')
            return
          } catch (e) {
            if (!(e instanceof ApiError) || e.code !== 'invalid_token') throw e
            session.clear()
          }
        }
        setPhase('welcome')
      } catch {
        setPhase('fatal')
      }
    })()
  }, [])

  const act = useCallback(async (fn: () => Promise<ParticipantState>) => {
    setBusy(true); setError(null)
    try {
      const st = await fn()
      setState(st); setExtra(0)
      window.scrollTo({ top: 0 })
      return true
    } catch (e) {
      if (e instanceof ApiError && e.code === 'wrong_step' && token) {
        // Out of sync (e.g. a retry after a lost response): re-read the server's state and continue from it.
        try { setState(await api.getState(token)); setExtra(0); return true } catch { /* fall through */ }
      }
      const code = e instanceof ApiError ? e.code : 'server_error'
      setError(ERROR_TEXT[code] ?? ERROR_TEXT.server_error)
      return false
    } finally {
      setBusy(false)
    }
  }, [token])

  const begin = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api.startSession()
      session.set(r.token); setToken(r.token); setState(r.state); setPhase('active')
      window.scrollTo({ top: 0 })
    } catch {
      setError(ERROR_TEXT.network)
    } finally { setBusy(false) }
  }

  const resume = async (code: string) => {
    setBusy(true); setError(null)
    try {
      const clean = code.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
      const st = await api.getState(clean)
      session.set(clean); setToken(clean); setState(st); setPhase('active')
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_token'
        ? 'That resume code was not recognised. Please check it and try again.' : ERROR_TEXT.network)
    } finally { setBusy(false) }
  }

  const doWithdraw = async () => {
    if (!token) return
    if (await act(() => api.withdraw(token))) setPanel(null)
  }

  if (phase === 'loading') return <Frame><p className="py-20 text-center text-slate-500">Loading…</p></Frame>
  if (phase === 'fatal') {
    return (
      <Frame>
        <Card>
          <h1 className="text-xl font-semibold">We could not load the study</h1>
          <p className="mt-2 text-slate-600">Please check your internet connection and reload this page. If the problem continues, contact the researcher.</p>
          <div className="mt-6"><Button onClick={() => window.location.reload()}>Reload</Button></div>
        </Card>
      </Frame>
    )
  }
  if (phase === 'welcome' || !state || !token) {
    return <Frame offline={offline} testBanner={testMode}><Welcome busy={busy} error={error} onBegin={begin} onResume={resume} /></Frame>
  }

  const props: StepProps = { token, state, policies, busy, error, act, setProgress: setExtra }
  const ended = state.step.startsWith('ended') || state.step === 'done'
  const percent = overallProgress(state, extra)

  let body
  switch (state.step) {
    case 'consent': body = <Consent {...props} />; break
    case 'demographics': body = <Demographics {...props} />; break
    case 'pretest': body = <Pretest {...props} />; break
    case 'game': case 'assign': body = <Game {...props} />; break
    case 'manipulation': body = <Manipulation {...props} />; break
    case 'posttest': body = <Posttest {...props} />; break
    case 'posttest_extra': body = <PostSupplementary {...props} />; break
    case 'checks': body = <ManipulationChecks {...props} />; break
    case 'debrief': body = <Debrief {...props} />; break
    default: body = <Ended step={state.step} />
  }

  return (
    <Frame
      offline={offline}
      testBanner={testMode || state.is_test}
      progress={ended ? undefined : <ProgressBar percent={percent} />}
      footer={ended ? null : (
        <div className="space-y-3 text-center text-xs text-slate-500">
          {panel === null && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              {state.step !== 'consent' && <button className="underline underline-offset-2 hover:text-slate-700" onClick={() => setPanel('code')}>Save my resume code</button>}
              <button className="underline underline-offset-2 hover:text-slate-700" onClick={() => setPanel('withdraw')}>Withdraw from the study</button>
            </div>
          )}
          {panel === 'code' && (
            <Card className="!p-4 text-left sm:!p-5">
              <p className="text-sm text-slate-700">Your progress is saved automatically on this device. To continue on another device or browser, enter this anonymous resume code on the first page:</p>
              <p className="my-3 break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm tracking-wide text-slate-900 select-all">{formatToken(token)}</p>
              <p className="text-xs text-slate-500">Anyone with this code can continue your session, so please keep it private. It cannot be used to identify you.</p>
              <div className="mt-3"><Button variant="secondary" onClick={() => setPanel(null)}>Close</Button></div>
            </Card>
          )}
          {panel === 'withdraw' && (
            <Card className="!p-4 text-left sm:!p-5">
              <p className="text-sm font-medium text-slate-800">Withdraw from the study?</p>
              <p className="mt-1 text-sm text-slate-600">If you withdraw now, everything you have entered so far will be deleted and you will not be able to continue. This is only possible before you submit your final responses; once submitted, responses are anonymous and cannot be traced back to you for removal.</p>
              {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger" disabled={busy} onClick={doWithdraw}>Yes, withdraw and delete my responses</Button>
                <Button variant="secondary" onClick={() => setPanel(null)}>Cancel, continue the study</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    >
      {body}
    </Frame>
  )
}

function Frame({
  children, progress, footer, offline, testBanner,
}: { children: React.ReactNode; progress?: React.ReactNode; footer?: React.ReactNode; offline?: boolean; testBanner?: boolean }) {
  return (
    <div className="min-h-screen">
      {testBanner && <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">Researcher test session — this run is flagged as a test and excluded from the dataset.</div>}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="mb-2 text-sm font-medium text-slate-700">University Policy Opinions Study</div>
          {progress ?? <div className="h-[34px]" />}
        </div>
      </header>
      {offline && <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="status">Connection problem — retrying automatically. Please keep this page open.</div>}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <div className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">{footer}</div>
    </div>
  )
}
