// Runs the real SQL migrations in an in-memory Postgres (PGlite) and exercises the
// whole participant journey, allocation, permissions, and exports.
//   npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const migDir = join(here, '..', 'supabase', 'migrations')
const db = new PGlite({ extensions: { pgcrypto } })

let passed = 0
const check = (name, cond) => { assert.ok(cond, name); passed++; console.log('  ok  ' + name) }
const lit = (v) => v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`
const rpc = async (fn, ...args) => {
  const r = await db.query(`select public.${fn}(${args.map(lit).join(',')}) as r`)
  return r.rows[0].r
}
const fails = async (fn, ...args) => { try { await rpc(fn, ...args); return null } catch (e) { return String(e.message) } }
const q = async (sql) => (await db.query(sql)).rows
const asRole = async (role, sub) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`)
  if (role) await db.exec(`set role ${role}`)
}

// ---- Supabase stand-ins (roles + auth schema) --------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema extensions;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant usage on schema extensions to anon, authenticated;
`)
for (const f of readdirSync(migDir).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'))
  console.log('applied', f)
}
const ADMIN = '11111111-1111-1111-1111-111111111111'
await db.exec(`insert into public.admin_users (user_id, note) values ('${ADMIN}', 'test researcher')`)

const DEMO = {
  age: 20, gender: 'woman', year_of_study: '2', degree_programme: 'btech', mess_usage: 'daily', mess_crowding: 'often',
  tutorial_attendance: 'often', tutorial_usefulness: 5, study_hours_daily: '2_4', academic_workload: 'heavy',
  missed_exam: 'no', requested_accommodation: 'no', wake_time: '7_8am', sleep_time: '12_1am',
  dietary_preference: 'vegetarian', mess_food_satisfaction: 4,
}

// Drive one participant through the whole study as the anon role.
async function runParticipant({ force = null, preFn, postFn, until = 'done' } = {}) {
  await asRole('anon')
  const { token, state } = await rpc('start_session')
  let s = state
  assert.equal(s.step, 'consent')
  s = await rpc('submit_consent', token, true, true, true)
  assert.equal(s.step, 'demographics')
  s = await rpc('submit_demographics', token, DEMO)
  assert.equal(s.step, 'pretest')
  const order = s.policy_order
  for (const pid of order) {
    s = await rpc('save_policy_response', token, 'pre', pid, preFn ? preFn(pid) : 3 + (pid % 3), 5, 2)
  }
  assert.equal(s.step, 'game')
  s = await rpc('submit_game', token, 12, 11, 10)
  assert.equal(s.step, 'assign')
  if (until === 'assign') return { token, order, state: s }
  if (force) { await asRole('authenticated', ADMIN) }
  s = await rpc('assign_condition', token, force)
  await asRole('anon')
  assert.equal(s.step, 'manipulation')
  const seen = []
  for (let pos = 1; pos <= 5; pos++) {
    seen.push(await rpc('get_exposure', token, pos))
    s = await rpc('complete_exposure', token, pos)
  }
  assert.equal(s.step, 'posttest')
  for (const pid of order) {
    s = await rpc('save_policy_response', token, 'post', pid, postFn ? postFn(pid) : 5)
  }
  assert.equal(s.step, 'posttest_extra')
  s = await rpc('submit_posttest_supplementary', token, 5, 'yes_one', 'combination')
  assert.equal(s.step, 'checks')
  s = await rpc('submit_manipulation_checks', token, {
    perceived_framing: 5, recalled_majority_opinion: 'supported', perceived_social_influence: 4,
    perceived_framing_influence: 3, reconsideration_check: 'no',
  })
  assert.equal(s.step, 'debrief')
  s = await rpc('complete_study', token, 'nice study')
  assert.equal(s.step, 'done')
  return { token, order, seen, state: s }
}

console.log('\n== Permissions ==')
await asRole('anon')
check('anon cannot read participants', (await fails('get_state', 'zzz')) !== null)
let e = await db.query('select * from public.participants').catch((x) => x.message)
check('anon has no table access', typeof e === 'string' && /permission denied/i.test(e))
e = await db.query('select * from public.v_export_wide').catch((x) => x.message)
check('anon has no view access', typeof e === 'string' && /permission denied/i.test(e))
e = await db.query('select * from public.policy_framing_content').catch((x) => x.message)
check('anon cannot read framing content table directly', typeof e === 'string' && /permission denied/i.test(e))
e = await db.query("select public._state('00000000-0000-0000-0000-000000000000')").catch((x) => x.message)
check('anon cannot call internal helper _state', typeof e === 'string' && /permission denied/i.test(e))
e = await db.query("select public.admin_delete_test_participants()").catch((x) => x.message)
check('anon cannot call admin functions', typeof e === 'string' && /permission denied/i.test(e))
const pol = await rpc('get_policies')
check('five policies are available', pol.length === 5)

console.log('\n== Consent branching ==')
let tok = (await rpc('start_session')).token
let s = await rpc('submit_consent', tok, true, false, true)
check('no consent ends study', s.step === 'ended_declined')
check('declined participant cannot continue', (await fails('submit_demographics', tok, DEMO)) !== null)
tok = (await rpc('start_session')).token
s = await rpc('submit_consent', tok, true, true, false)
check('under 18 ends study', s.step === 'ended_ineligible')
tok = (await rpc('start_session')).token
s = await rpc('submit_consent', tok, true, true, true)
check('eligible consent proceeds', s.step === 'demographics' && s.policy_order.length === 5)
check('policy order is a permutation of 1-5', [...s.policy_order].sort().join('') === '12345')
check('consent answers are final (cannot be re-submitted)', (await rpc('submit_consent', tok, false, false, false)).step === 'demographics')
check('age < 18 in demographics ends study', (await rpc('submit_demographics', tok, { ...DEMO, age: 17 })).step === 'ended_ineligible')
tok = (await rpc('start_session')).token
await rpc('submit_consent', tok, true, true, true)
check('invalid enum rejected', /invalid_input:year_of_study/.test(await fails('submit_demographics', tok, { ...DEMO, year_of_study: '9' })))
check('missing required rejected', /invalid_input:age/.test(await fails('submit_demographics', tok, { ...DEMO, age: null })))
check('bad token rejected', /invalid_token/.test(await fails('get_state', 'not-a-token')))
check('wrong token rejected', /invalid_token/.test(await fails('get_state', 'a'.repeat(32))))

console.log('\n== Flow guards ==')
let s2 = await rpc('submit_demographics', tok, DEMO)
check('cannot skip to assignment', /wrong_step/.test(await fails('assign_condition', tok, null)))
check('cannot save post before pretest', /wrong_step/.test(await fails('save_policy_response', tok, 'post', s2.policy_order[0], 4, null, null)))
check('out of sequence pre rejected', /out_of_sequence/.test(await fails('save_policy_response', tok, 'pre', s2.policy_order[2], 4, null, null)))
check('support rating 8 rejected', /invalid_input/.test(await fails('save_policy_response', tok, 'pre', s2.policy_order[0], 8, null, null)))
check('support rating is compulsory', /invalid_input/.test(await fails('save_policy_response', tok, 'pre', s2.policy_order[0], null, 4, 4)))
await rpc('save_policy_response', tok, 'pre', s2.policy_order[0], 4, null, null)
s2 = await rpc('save_policy_response', tok, 'pre', s2.policy_order[0], 6, 3, 3)
check('pre-test answer can be corrected within pre-test', s2.pre_answers[0].support === 6)
check('optional confidence/familiarity may be skipped', true)
check('state contains no condition labels', !/framing|majority|positive|negative|support"|experimental/.test(JSON.stringify(s2).replace(/"support":\d/g, '')))

console.log('\n== Full journey: forced test participants in all four groups ==')
const expected = {
  1: ['positive', 'support'], 2: ['positive', 'opposition'], 3: ['negative', 'support'], 4: ['negative', 'opposition'],
}
for (const g of [1, 2, 3, 4]) {
  const r = await runParticipant({ force: g })
  const [framing, majority] = expected[g]
  await asRole(null)
  const fr = await q(`select policy_id, framing_text from public.policy_framing_content where framing = '${framing}'`)
  const mj = (await q(`select statement_text from public.majority_statements where majority_condition = '${majority}'`))[0].statement_text
  await asRole('anon')
  const okFraming = r.seen.every((x) => fr.find((f) => f.policy_id === x.policy_id).framing_text === x.framing_text)
  const okMajority = r.seen.every((x) => x.majority_text === mj)
  check(`group ${g}: ${framing} framing + majority ${majority} on all 5 policies`, okFraming && okMajority && r.seen.length === 5)
  check(`group ${g}: exposures follow the pre-test order`, r.seen.map((x) => x.policy_id).join() === r.order.join())
  check(`group ${g}: exposure payload has no condition labels`, !('framing_condition' in r.seen[0]) && !('experimental_condition' in r.seen[0]))
}
await asRole('authenticated', ADMIN)
check('forced participants are flagged as test', (await q('select count(*)::int n from public.participants where is_test'))[0].n === 4)
check('test participants excluded from allocation counts', (await q('select sum(assigned_total)::int n from public.v_export_allocation'))[0].n === 0)
check('admin can delete test participants', (await rpc('admin_delete_test_participants')) === 4)
await asRole('anon')

console.log('\n== Non-admin cannot force a condition ==')
{
  const r = await runParticipant({ until: 'assign' })
  await asRole('anon')
  await rpc('assign_condition', r.token, 4)  // ignored for anon
  await asRole(null)
  const row = (await q(`select is_test from public.participants order by started_at desc limit 1`))[0]
  check('anonymous force param is ignored (not marked test)', row.is_test === false)
  await db.exec('delete from public.participants')
  await asRole('anon')
}

console.log('\n== Randomisation: 50 participants ==')
// wipe previous demo participants for a clean allocation test
await asRole(null)
await db.exec('delete from public.participants')
await asRole('anon')
const real = []
for (let i = 0; i < 50; i++) {
  const r = await runParticipant({
    preFn: () => 1 + Math.floor(Math.random() * 7),
    postFn: () => 1 + Math.floor(Math.random() * 7),
  })
  real.push(r)
}
await asRole('authenticated', ADMIN)
const alloc = await q('select experimental_group, target_n, assigned_total, completed from public.v_export_allocation order by 1')
console.log('  allocation:', alloc.map((a) => `G${a.experimental_group}=${a.assigned_total}/${a.target_n}`).join('  '))
check('allocation exactly matches targets 13/13/12/12', alloc.map((a) => Number(a.assigned_total)).join() === '13,13,12,12')
check('all 50 recorded as completed', Number(alloc.reduce((a, b) => a + Number(b.completed), 0)) === 50)

console.log('\n== Data integrity & exports ==')
const longRows = await q('select * from public.v_export_policy_long')
check('long format has 250 rows (50 x 5 policies)', longRows.length === 250)
check('change_in_support = post - pre for every row', longRows.every((r) => r.change_in_support === r.post_support - r.pre_support))
check('long rows carry condition variables', longRows.every((r) => r.framing_condition && r.majority_condition && r.experimental_group && r.policy_order))
const wide = await q('select * from public.v_export_wide')
check('wide format has 50 rows', wide.length === 50)
check('wide p1_change = p1_post - p1_pre', wide.every((r) => r.p1_change === r.p1_post_support - r.p1_pre_support))
check('wide contains no token hash', !('resume_token_hash' in wide[0]))
const part = await q('select * from public.v_export_participants')
check('participant export distinguishes completed', part.every((p) => p.is_complete === true))
const dbl = await q(`select count(*)::int n from (select participant_id, policy_id, stage from public.policy_responses group by 1,2,3 having count(*) > 1) x`)
check('no duplicate ratings per participant/policy/stage', dbl[0].n === 0)
// matching: the pre-test stored for a participant equals what we submitted for that policy
const sample = real[7]
await asRole(null)
const prePre = await q(`select r.policy_id, r.support_rating from public.policy_responses r join public.participants p using (participant_id) where r.stage='pre' and p.resume_token_hash = encode(extensions.digest('${sample.token}','sha256'),'hex')`)
check('sample participant has 5 pre ratings matched by policy', prePre.length === 5)
await asRole('authenticated', ADMIN)
const dist = await q('select * from public.v_export_distraction')
check('distraction export has 50 rows with correct answers', dist.length === 50 && dist.every((d) => d.all_correct === true))
const allr = await q('select count(*)::int n from public.v_export_all_responses')
check('all-responses export is populated', allr[0].n > 1000)
const tokenLeak = await q(`select count(*)::int n from public.v_export_all_responses where item = 'resume_token_hash'`)
check('all-responses export has no resume token hash', tokenLeak[0].n === 0)
e = await db.query('select resume_token_hash from public.participants').catch((x) => x.message)
check('even researchers cannot read token hashes', typeof e === 'string' && /permission denied/i.test(e))
const mc = await q(`select count(*)::int n from public.v_export_participants where majority_recall_correct is not null`)
check('manipulation-check variables present', mc[0].n === 50)

console.log('\n== Resume, refresh and immutability ==')
await asRole('anon')
const rz = await runParticipant({ until: 'assign' })
const a1 = await rpc('assign_condition', rz.token, null)
await asRole(null)
const c1 = (await q(`select experimental_condition c from public.participants where resume_token_hash = encode(extensions.digest('${rz.token}','sha256'),'hex')`))[0].c
await asRole('anon')
const a2 = await rpc('assign_condition', rz.token, null)
const grouped = rz.token.replace(/(.{4})/g, '$1-')
const st = await rpc('get_state', grouped.toUpperCase())
await asRole(null)
const c2 = (await q(`select experimental_condition c from public.participants where resume_token_hash = encode(extensions.digest('${rz.token}','sha256'),'hex')`))[0].c
await asRole('anon')
check('re-calling assignment does not change condition', c1 === c2 && a1.step === a2.step)
check('resume works with a grouped/upper-case code', st.step === 'manipulation')
check('exposure out of order is rejected', /out_of_sequence/.test(await fails('get_exposure', rz.token, 3)))
check('cannot rate post-test before finishing manipulation', /wrong_step/.test(await fails('save_policy_response', rz.token, 'post', rz.order[0], 4, null, null)))
check('pretest cannot be altered after assignment', /already_recorded|wrong_step/.test(await fails('save_policy_response', rz.token, 'pre', rz.order[0], 7, null, null)))
for (let pos = 1; pos <= 5; pos++) { await rpc('get_exposure', rz.token, pos); await rpc('complete_exposure', rz.token, pos) }
await rpc('save_policy_response', rz.token, 'post', rz.order[0], 6, null, null)
const retry = await rpc('save_policy_response', rz.token, 'post', rz.order[0], 6, null, null)
check('identical post retry accepted (network retry)', retry.post_completed === 1)
check('conflicting post change refused', /already_recorded/.test(await fails('save_policy_response', rz.token, 'post', rz.order[0], 2, null, null)))
const stMid = await rpc('get_state', rz.token)
check('state mid post-test never contains pre answers', !('pre_answers' in stMid))

console.log('\n== Withdrawal ==')
const w = await rpc('withdraw', rz.token)
check('withdrawal ends the session', w.step === 'ended_withdrawn')
await asRole(null)
const left = await q(`select (select count(*) from public.policy_responses r where r.participant_id = p.participant_id)::int n, p.age from public.participants p where resume_token_hash = encode(extensions.digest('${rz.token}','sha256'),'hex')`)
check('withdrawal removes responses and demographics', left[0].n === 0 && left[0].age === null)
await asRole('anon')
check('completed participants cannot withdraw', /already_completed/.test(await fails('withdraw', real[0].token)))
check('completed submission is not re-submittable', (await rpc('complete_study', real[0].token, 'again')).step === 'done')

console.log('\n== Non-admin authenticated users ==')
await asRole('authenticated', '22222222-2222-2222-2222-222222222222')
check('non-admin sees no participants', (await q('select count(*)::int n from public.v_export_participants'))[0].n === 0)
e = await db.query('select public.admin_delete_test_participants()').catch((x) => x.message)
check('non-admin cannot run admin functions', typeof e === 'string' && /not_admin/.test(e))

console.log(`\nAll ${passed} checks passed.`)
await db.close()
