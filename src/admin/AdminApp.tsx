import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice } from '../components/ui'
import { BarChart } from './charts'
import { analyse, fetchAll, fmt, GROUP_LABEL, POLICY_LABEL, type Row } from './data'
import { downloadCsv, toCsv } from './csv'
import { dictionaryCsvRows } from '../content/dictionary'

type Tab = 'overview' | 'participants' | 'analysis' | 'export' | 'test'
const TABS: [Tab, string][] = [['overview', 'Overview'], ['participants', 'Participants'], ['analysis', 'Analysis'], ['export', 'Export data'], ['test', 'Test the conditions']]

export default function AdminApp() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'denied' | 'in'>('loading')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) { setAuth('out'); return }
    const { data: ok } = await supabase.rpc('is_admin')
    setAuth(ok === true ? 'in' : 'denied')
  }, [])
  useEffect(() => { void check() }, [check])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) { setErr('Sign-in failed. Check your email and password.'); return }
    setPw(''); await check()
  }
  const signOut = async () => { await supabase.auth.signOut(); setAuth('out') }

  if (auth === 'loading') return <div className="p-10 text-center text-slate-500">Loading…</div>
  if (auth === 'out') {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <h1 className="text-xl font-semibold">Researcher sign-in</h1>
          <p className="mt-1 text-sm text-slate-500">Authorised researchers only.</p>
          <form onSubmit={signIn} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">Email
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
            </label>
            <label className="block text-sm font-medium">Password
              <input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
            </label>
            {err && <Notice tone="error">{err}</Notice>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </Card>
      </div>
    )
  }
  if (auth === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-slate-600">This account is not on the researcher allow-list. See the setup guide for how to grant access.</p>
          <div className="mt-6"><Button variant="secondary" onClick={signOut}>Sign out</Button></div>
        </Card>
      </div>
    )
  }
  return <Dashboard onSignOut={signOut} />
}

// ---------------------------------------------------------------------------------------------
function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Row[]>([])
  const [alloc, setAlloc] = useState<Row[]>([])
  const [long, setLong] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [o, a, l] = await Promise.all([
        fetchAll('v_participant_overview', 'started_at'),
        fetchAll('v_export_allocation', 'experimental_group'),
        fetchAll('v_export_policy_long', 'participant_id'),
      ])
      setOverview(o); setAlloc(a); setLong(l); setUpdated(new Date())
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="font-semibold text-slate-900">BRED study — researcher dashboard</div>
            <div className="text-xs text-slate-500">{updated ? `Updated ${updated.toLocaleTimeString()}` : ''}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading} className="!min-h-10 !px-4 !py-2 text-sm">{loading ? 'Refreshing…' : 'Refresh'}</Button>
            <Button variant="ghost" onClick={onSignOut} className="!min-h-10 !px-4 !py-2 text-sm">Sign out</Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Dashboard sections">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === id ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && <Notice tone="error">Could not load data: {error}</Notice>}
        {tab === 'overview' && <Overview overview={overview} alloc={alloc} />}
        {tab === 'participants' && <Participants overview={overview} />}
        {tab === 'analysis' && <Analysis long={long} />}
        {tab === 'export' && <Export />}
        {tab === 'test' && <TestTools onChanged={load} testCount={overview.filter((r) => r.is_test).length} />}
      </main>
    </div>
  )
}

const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>
)

function Overview({ overview, alloc }: { overview: Row[]; alloc: Row[] }) {
  const real = overview.filter((r) => !r.is_test)
  const started = real.length
  const consented = real.filter((r) => ['in_progress', 'completed', 'withdrawn'].includes(r.submission_status) && r.consented_at).length
  const completed = real.filter((r) => r.is_complete).length
  const incomplete = started - completed
  const by = (s: string) => real.filter((r) => r.submission_status === s).length
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Started" value={started} />
        <Stat label="Consented" value={consented} />
        <Stat label="Completed" value={completed} />
        <Stat label="Incomplete" value={incomplete} hint="started but not completed" />
        <Stat label="Completion rate" value={consented ? `${Math.round((completed / consented) * 100)}%` : '–'} hint={`of consented · ${started ? Math.round((completed / started) * 100) : 0}% of started`} />
      </div>

      <Card className="!p-5">
        <h2 className="font-semibold">Experimental group allocation</h2>
        <p className="mb-4 text-xs text-slate-500">Counts exclude researcher test sessions. “Assigned” = in progress or completed.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4">Group</th><th className="pr-4">Condition</th><th className="pr-4">Target</th><th className="pr-4">Assigned</th><th className="pr-4">Completed</th><th>In progress</th></tr></thead>
            <tbody>
              {alloc.map((a) => (
                <tr key={a.experimental_group} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium">Group {a.experimental_group}</td>
                  <td className="pr-4 capitalize">{a.framing_condition} + {a.majority_condition}</td>
                  <td className="pr-4">{a.target_n}</td><td className="pr-4">{a.assigned_total}</td><td className="pr-4">{a.completed}</td><td>{a.in_progress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 max-w-2xl">
          <BarChart
            title="Participants per experimental group"
            items={alloc.map((a) => ({ label: GROUP_LABEL[a.experimental_group], values: [Number(a.assigned_total), Number(a.completed)] }))}
            series={[{ name: 'Assigned', color: '#9db7dc' }, { name: 'Completed', color: '#2f5f9e' }]}
            domain={[0, Math.max(14, ...alloc.map((a) => Number(a.target_n)))]} format={(v) => String(v)} height={20}
          />
        </div>
      </Card>

      <Card className="!p-5">
        <h2 className="mb-3 font-semibold">Status breakdown</h2>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          {[['In progress', by('in_progress')], ['Completed', by('completed')], ['Declined consent', by('declined_consent')], ['Under 18', by('ineligible_age')], ['Withdrawn', by('withdrawn')]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-semibold">{v}</div></div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Sessions opened but not yet consented ({by('started')}) are counted under “Started”.</p>
      </Card>
    </>
  )
}

function Participants({ overview }: { overview: Row[] }) {
  const [showTest, setShowTest] = useState(false)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const rows = useMemo(() => overview.filter((r) => (showTest || !r.is_test) && (status === 'all' || r.submission_status === status) && (!q || r.participant_id.includes(q.trim().toLowerCase()))).reverse(), [overview, showTest, status, q])
  const pages = Math.max(1, Math.ceil(rows.length / 50))
  const view = rows.slice(page * 50, page * 50 + 50)
  const t = (v?: string | null) => (v ? new Date(v).toLocaleString() : '–')
  const badge = (s: string) => ({ completed: 'bg-emerald-100 text-emerald-800', in_progress: 'bg-sky-100 text-sky-800', started: 'bg-slate-100 text-slate-700' } as Record<string, string>)[s] ?? 'bg-amber-100 text-amber-800'
  return (
    <Card className="!p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <input placeholder="Search participant ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} className="rounded-xl border border-slate-300 px-3 py-2" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }} className="rounded-xl border border-slate-300 px-3 py-2" aria-label="Filter by status">
          {['all', 'completed', 'in_progress', 'started', 'declined_consent', 'ineligible_age', 'withdrawn'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Show test sessions</label>
        <span className="text-slate-500">{rows.length} participants</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">Participant ID</th><th className="pr-3">Status</th><th className="pr-3">Group</th><th className="pr-3">Pre</th><th className="pr-3">Exposure</th><th className="pr-3">Post</th><th className="pr-3">Started</th><th className="pr-3">Completed</th><th>Last activity</th></tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.participant_id} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-mono text-xs" title={r.participant_id}>{r.participant_id.slice(0, 8)}…{r.is_test && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">TEST</span>}</td>
                <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${badge(r.submission_status)}`}>{r.submission_status.replace('_', ' ')}</span></td>
                <td className="pr-3">{r.experimental_group ? `G${r.experimental_group} · ${r.framing_condition}/${r.majority_condition}` : '–'}</td>
                <td className="pr-3">{r.pretest_items}/5</td><td className="pr-3">{r.exposures_completed}/5</td><td className="pr-3">{r.posttest_items}/5</td>
                <td className="pr-3">{t(r.started_at)}</td><td className="pr-3">{t(r.completed_at)}</td><td>{t(r.last_activity_at)}</td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={9} className="py-8 text-center text-slate-500">No participants yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <Button variant="secondary" className="!min-h-9 !px-3 !py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages}</span>
          <Button variant="secondary" className="!min-h-9 !px-3 !py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </Card>
  )
}

function Analysis({ long }: { long: Row[] }) {
  const a = useMemo(() => analyse(long), [long])
  if (!a.participants) return <Card><p className="text-slate-600">No completed participants yet. Charts appear here once responses are submitted.</p></Card>
  const cellTable = (title: string, rows: { label: string; n: number; change: number | null }[]) => (
    <Card className="!p-5">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Condition</th><th>n</th><th>Mean change</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-slate-100"><td className="py-2">{r.label}</td><td>{r.n}</td><td className="font-medium">{fmt(r.change)}</td></tr>)}</tbody></table>
      <div className="mt-4"><BarChart title={title} items={rows.map((r) => ({ label: r.label, values: [r.change] }))} series={[{ name: 'Mean change', color: '#2f5f9e' }]} domain={[-3, 3]} height={22} /></div>
    </Card>
  )
  return (
    <>
      <Notice>
        Descriptive statistics for <b>{a.participants} completed participants</b> (test sessions excluded). Change = post-test − pre-test support (1–7 scale).
        Group and condition means use one value per participant (the mean of their five policy changes). <b>No significance tests have been run</b>, so these figures
        do not show that any difference is statistically reliable; export the data and analyse it with an appropriate model.
      </Notice>
      <Card className="!p-5">
        <h2 className="mb-3 font-semibold">Average support by policy</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Policy</th><th>n</th><th>Mean pre</th><th>Mean post</th><th>Mean change</th></tr></thead>
            <tbody>{a.byPolicy.map((p) => <tr key={p.policy_id} className="border-t border-slate-100"><td className="py-2">{p.policy_id}. {POLICY_LABEL[p.policy_id]}</td><td>{p.n}</td><td>{fmt(p.pre)}</td><td>{fmt(p.post)}</td><td className="font-medium">{fmt(p.change)}</td></tr>)}</tbody></table>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <BarChart title="Mean pre-test and post-test support by policy" items={a.byPolicy.map((p) => ({ label: POLICY_LABEL[p.policy_id], values: [p.pre, p.post] }))} series={[{ name: 'Pre-test', color: '#9db7dc' }, { name: 'Post-test', color: '#2f5f9e' }]} domain={[0, 7]} height={16} />
          <BarChart title="Mean change in support by policy" items={a.byPolicy.map((p) => ({ label: POLICY_LABEL[p.policy_id], values: [p.change] }))} series={[{ name: 'Mean change', color: '#2f5f9e' }]} domain={[-3, 3]} height={22} />
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {cellTable('Mean change by framing condition', a.byFraming)}
        {cellTable('Mean change by perceived majority opinion', a.byMajority)}
      </div>
      {cellTable('Mean change for each of the four experimental groups', a.byGroup)}
      <Card className="!p-5">
        <h3 className="mb-3 font-semibold">Mean change by policy and group</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Policy</th>{[1, 2, 3, 4].map((g) => <th key={g}>G{g} (n)</th>)}</tr></thead>
          <tbody>{a.policyByGroup.map((r) => <tr key={r.policy_id} className="border-t border-slate-100"><td className="py-2">{POLICY_LABEL[r.policy_id]}</td>{r.cells.map((c) => <td key={c.group}>{fmt(c.change)} <span className="text-slate-400">({c.n})</span></td>)}</tr>)}</tbody></table></div>
      </Card>
    </>
  )
}

function Export() {
  const [includeIncomplete, setIncl] = useState(false)
  const [includeTest, setTest] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const run = async (key: string, view: string, orderBy: string, file: string, filter = true) => {
    setBusy(key); setMsg(null)
    try {
      let rows = await fetchAll(view, orderBy)
      if (filter) rows = rows.filter((r) => (includeTest || !r.is_test) && (includeIncomplete || r.is_complete))
      downloadCsv(`bred_${file}_${today}.csv`, toCsv(rows))
      setMsg(`${file}.csv downloaded (${rows.length} rows).`)
    } catch (e) { setMsg(`Export failed: ${(e as Error).message}`) } finally { setBusy(null) }
  }
  const items: { key: string; title: string; text: string; view: string; order: string; file: string; filter?: boolean }[] = [
    { key: 'all', title: 'All responses', text: 'Every stored answer, one row each (participant, section, policy, item, response). Complete raw record.', view: 'v_export_all_responses', order: 'participant_id', file: 'all_responses' },
    { key: 'part', title: 'Participant-level data', text: 'One row per participant: consent, demographics, condition, game, supplementary and manipulation-check variables.', view: 'v_export_participants', order: 'started_at', file: 'participants' },
    { key: 'long', title: 'Policy responses (long format)', text: 'One row per participant × policy with pre, post, change, condition and policy order. Use participant as a random effect.', view: 'v_export_policy_long', order: 'participant_id', file: 'policy_long' },
    { key: 'wide', title: 'Wide format (SPSS / Excel)', text: 'One row per participant with p1_…p5_ pre/post/change columns and mean_change_all_policies.', view: 'v_export_wide', order: 'started_at', file: 'participants_wide' },
    { key: 'alloc', title: 'Condition allocation table', text: 'Targets vs assigned and completed per experimental group.', view: 'v_export_allocation', order: 'experimental_group', file: 'allocation', filter: false },
    { key: 'dist', title: 'Distraction task responses', text: 'Counting-task answers (descriptive only; not an outcome).', view: 'v_export_distraction', order: 'participant_id', file: 'distraction_task' },
  ]
  return (
    <div className="space-y-4">
      <Card className="!p-5">
        <h2 className="font-semibold">Export options</h2>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeIncomplete} onChange={(e) => setIncl(e.target.checked)} /> Include incomplete participants (an <code>is_complete</code> column marks them)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeTest} onChange={(e) => setTest(e.target.checked)} /> Include researcher test sessions</label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Default: completed, non-test participants only. Participants are never excluded for failing manipulation checks.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <Card key={it.key} className="!p-5">
            <h3 className="font-semibold">{it.title}</h3>
            <p className="mt-1 mb-4 text-sm text-slate-600">{it.text}</p>
            <Button variant="secondary" disabled={busy !== null} onClick={() => run(it.key, it.view, it.order, it.file, it.filter ?? true)}>{busy === it.key ? 'Preparing…' : 'Download CSV'}</Button>
          </Card>
        ))}
        <Card className="!p-5">
          <h3 className="font-semibold">Data dictionary</h3>
          <p className="mt-1 mb-4 text-sm text-slate-600">Every variable, its type and coding (also in docs/DATA_DICTIONARY.md).</p>
          <Button variant="secondary" onClick={() => downloadCsv(`bred_data_dictionary.csv`, toCsv(dictionaryCsvRows()))}>Download CSV</Button>
        </Card>
      </div>
      {msg && <Notice>{msg}</Notice>}
    </div>
  )
}

function TestTools({ onChanged, testCount }: { onChanged: () => void; testCount: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const open = (g: number) => window.open(`${window.location.origin}${window.location.pathname}?test_group=${g}`, '_blank')
  const purge = async () => {
    const { data, error } = await supabase.rpc('admin_delete_test_participants')
    setConfirm(false)
    setMsg(error ? `Failed: ${error.message}` : `Deleted ${data} test session(s).`)
    onChanged()
  }
  return (
    <div className="space-y-4">
      <Card className="!p-5">
        <h2 className="font-semibold">Preview each experimental condition</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each button opens a fresh participant session in a new tab and forces that condition at the assignment step. This only works while you are signed in
          to this dashboard in the same browser; for everyone else the condition is always chosen by the server&rsquo;s random allocation. Test sessions are flagged,
          never counted towards group quotas, and excluded from exports.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((g) => <Button key={g} variant="secondary" onClick={() => open(g)}>Open as {GROUP_LABEL[g]}</Button>)}
        </div>
      </Card>
      <Card className="!p-5">
        <h2 className="font-semibold">Remove test data before launch</h2>
        <p className="mt-1 text-sm text-slate-600">{testCount} test session(s) currently stored. Deleting removes them and all their responses permanently.</p>
        {!confirm ? (
          <div className="mt-4"><Button variant="secondary" disabled={!testCount} onClick={() => setConfirm(true)}>Delete test sessions…</Button></div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-sm">Really delete {testCount} test session(s)?</span><Button variant="danger" onClick={purge}>Yes, delete</Button><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button></div>
        )}
        {msg && <div className="mt-4"><Notice>{msg}</Notice></div>}
      </Card>
    </div>
  )
}
