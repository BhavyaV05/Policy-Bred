// Real-browser end-to-end test: UI -> REST shim -> real SQL (PGlite).
//   node tests/e2e/e2e.mjs [screenshotDir]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createShim, ADMIN_EMAIL, ADMIN_PASSWORD } from './shim.mjs'

const SHOTS = process.argv[2] || 'tests/e2e/shots'
mkdirSync(SHOTS, { recursive: true })
const APP = 'http://localhost:5199'
let passed = 0
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log('  ok  ' + name) }

const freePorts = () => new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort 5199 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }']).on('close', r))
if (process.platform === 'win32') await freePorts()
const shim = await createShim(54321)
const sql = async (s) => (await (await fetch('http://localhost:54321/__sql', { method: 'POST', body: JSON.stringify({ sql: s }) })).json())

const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', '5199', '--strictPort'], {
  cwd: process.cwd(), shell: process.platform === 'win32',
  env: { ...process.env, VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_RESEARCHER_NAME: 'Dr. Test Researcher' },
})
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000)
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve() } })
  vite.stderr.on('data', (d) => process.stderr.write(d))
})

const browser = await chromium.launch()
const radio = (page, name, value) => page.locator(`input[name="${name}"][value="${value}"]`).check({ force: true })
const click = (page, name) => page.getByRole('button', { name, exact: true }).click()

async function journey(page, label, opts = {}) {
  try { return await journeyInner(page, label, opts) } catch (e) { await page.screenshot({ path: `${SHOTS}/${label}-FAIL.png`, fullPage: true }).catch(() => {}); throw e }
}
async function journeyInner(page, label, { shot = false, reloadAt = [], onExposure } = {}) {
  page.setDefaultTimeout(15000)
  const snap = async (n) => { if (shot) await page.screenshot({ path: `${SHOTS}/${label}-${n}.png`, fullPage: true }) }
  const maybeReload = async (key) => { if (reloadAt.includes(key)) { await page.reload(); await page.waitForLoadState('networkidle') } }

  await page.goto(APP); await page.getByRole('heading', { name: 'Welcome' }).waitFor(); await snap('01-welcome')
  await click(page, 'Continue')
  await page.getByRole('heading', { name: 'Participant Information Sheet' }).waitFor(); await snap('02-consent')
  await radio(page, 'c1', 'yes'); await radio(page, 'c2', 'yes'); await radio(page, 'c3', 'yes'); await click(page, 'Continue')

  await page.getByRole('heading', { name: 'About you' }).waitFor(); await snap('03-demographics')
  await page.getByRole('spinbutton', { name: 'What is your age?' }).fill('20')
  await radio(page, 'gender', 'woman'); await radio(page, 'year_of_study', '2'); await radio(page, 'degree_programme', 'btech'); await click(page, 'Next')
  await page.getByRole('heading', { name: 'Living and mess use' }).waitFor()
  await radio(page, 'mess_usage', 'daily'); await radio(page, 'mess_crowding', 'often'); await click(page, 'Next')
  await radio(page, 'tutorial_attendance', 'often'); await click(page, 'Next')
  await click(page, 'Next')                          // lifestyle: all optional
  if (reloadAt.includes('demographics')) {
    await maybeReload('demographics')                // draft survives a refresh
    await page.getByRole('heading', { name: 'About you' }).waitFor()
    ok(`${label}: demographics draft restored after refresh`, (await page.getByRole('spinbutton', { name: 'What is your age?' }).inputValue()) === '20')
    for (let i = 0; i < 4; i++) await click(page, 'Next')
  }
  await page.getByRole('heading', { name: 'Food and mess preferences' }).waitFor()
  await radio(page, 'mess_food_satisfaction', '4'); await click(page, 'Continue')

  await page.getByRole('heading', { name: 'Your Initial Opinions on University Policies' }).waitFor(); await snap('04-pretest-intro')
  await click(page, 'Continue')
  const pre = []
  for (let i = 0; i < 5; i++) {
    await page.getByText(`Policy ${i + 1} of 5`).first().waitFor()
    if (i === 0) await snap('05-pretest-policy')
    const title = await page.locator('h2').first().innerText()
    const support = ((i * 2) % 7) + 1
    await radio(page, `s-${await page.locator('input[name^="s-"]').first().getAttribute('name').then((n) => n.slice(2))}`, support)
    pre.push({ title, support })
    if (i === 2) { await click(page, 'Continue'); await maybeReload('pretest'); await page.getByText('Policy 4 of 5').first().waitFor(); continue }
    await click(page, 'Continue')
  }

  await page.getByRole('heading', { name: 'A Short Visual Activity' }).waitFor(); await snap('06-game-intro')
  await click(page, 'Start activity'); await snap('07-game')
  const nums = page.locator('input[type=number]')
  await nums.nth(0).fill('1'); await nums.nth(1).fill('1'); await nums.nth(2).fill('1')
  await click(page, 'Submit answers')
  await page.getByText('Some of the counts do not match').waitFor()
  ok(`${label}: wrong game answers get a neutral retry message`, true)
  await nums.nth(0).fill('12'); await nums.nth(1).fill('11'); await nums.nth(2).fill('10'); await click(page, 'Submit answers')
  await page.getByText('Thank you! You can now proceed to the next section.').waitFor(); await snap('08-game-done')
  await page.getByRole('heading', { name: 'More About the Policies' }).waitFor({ timeout: 15000 })
  await click(page, 'Continue')

  const seen = []
  for (let i = 0; i < 5; i++) {
    await page.getByText(`Policy ${i + 1} of 5`).first().waitFor()
    const title = await page.locator('h1').first().innerText()
    const framing = await page.locator('section[aria-label="Description of the policy"] p').innerText()
    const majority = await page.locator('section[aria-label="Information about other students"] p').innerText()
    seen.push({ title, framing, majority })
    if (i === 0) await snap('09-manipulation')
    if (i === 1) { await maybeReload('manipulation'); await page.getByText('Policy 2 of 5').first().waitFor(); ok(`${label}: refresh keeps the same manipulation block`, (await page.locator('section[aria-label="Description of the policy"] p').innerText()) === framing) }
    await click(page, 'Continue')
  }
  if (onExposure) await onExposure(seen, pre)

  await page.getByRole('heading', { name: 'Your Final Opinions' }).waitFor(); await click(page, 'Continue')
  for (let i = 0; i < 5; i++) {
    await page.getByText(`Policy ${i + 1} of 5`).first().waitFor()
    if (i === 0) {
      await snap('10-posttest')
      const txt = await page.locator('main').innerText()
      ok(`${label}: post-test does not repeat framing/majority text or pre-test answers`, !/majority of university students|Other students/i.test(txt) && !/Your previous/i.test(txt))
    }
    const name = await page.locator('input[name^="post-"]').first().getAttribute('name')
    await radio(page, name, ((i * 3) % 7) + 1)
    await click(page, 'Continue')
  }
  await page.getByRole('heading', { name: 'A few more questions about your opinions' }).waitFor()
  await radio(page, 'fc', 5); await radio(page, 'rc', 'yes_one'); await radio(page, 'fa', 'combination'); await click(page, 'Continue')
  await page.getByRole('heading', { name: 'A Few Questions About Your Experience' }).waitFor(); await snap('11-checks')
  await radio(page, 'm1', 5); await radio(page, 'm2', 'supported'); await radio(page, 'm3', 4); await radio(page, 'm4', 3); await radio(page, 'm5', 'no'); await click(page, 'Continue')
  await page.getByRole('heading', { name: 'Thank you for participating in this study!' }).waitFor(); await snap('12-debrief')
  const txt = await page.locator('main').innerText()
  ok(`${label}: debrief says majority statements were hypothetical`, /hypothetical/.test(txt) && /not based on actual survey findings/.test(txt))
  await page.locator('#comment').fill('Smooth experience.')
  await click(page, 'Submit my responses')
  await page.getByText('Your responses have been successfully submitted. Thank you for participating!').waitFor(); await snap('13-done')
  return { seen, pre }
}

try {
  console.log('\n== Participant 1 (desktop, with refreshes) ==')
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p1 = await ctx1.newPage()
  const errors = []
  p1.on('pageerror', (e) => errors.push(e.message))
  const r1 = await journey(p1, 'desktop', { shot: true, reloadAt: ['demographics', 'pretest', 'manipulation'] })
  let rows = await sql(`select experimental_condition c, framing_condition f, majority_condition m, submission_status s, policy_order from public.participants where not is_test`)
  ok('participant 1 stored as completed with one fixed condition', rows.length === 1 && rows[0].s === 'completed' && rows[0].c >= 1)
  const row = rows[0]
  const wantMajority = row.m === 'support' ? 'support' : 'oppose'
  ok('all 5 majority statements match the assigned majority condition', r1.seen.every((x) => x.majority.includes(`students ${wantMajority} introducing`)))
  const framingTexts = await sql(`select policy_id, framing_text from public.policy_framing_content where framing = '${row.f}' order by policy_id`)
  ok('all 5 framing paragraphs match the assigned framing', r1.seen.every((x) => framingTexts.some((f) => f.framing_text === x.framing)))
  ok('manipulation order equals recorded policy order', JSON.stringify(r1.seen.map((x) => x.framing)) === JSON.stringify(row.policy_order.map((id) => framingTexts.find((f) => f.policy_id === id).framing_text)))
  const long = await sql(`select policy_id, position_in_order, pre_support, post_support, change_in_support from public.v_export_policy_long order by position_in_order`)
  ok('five pre/post pairs stored with matching change scores', long.length === 5 && long.every((r) => r.change_in_support === r.post_support - r.pre_support))
  ok('pre-test answers were saved against the right policies in order', long.every((r, i) => r.pre_support === ((i * 2) % 7) + 1))
  ok('no uncaught page errors', errors.length === 0)
  const stored = await p1.evaluate(() => localStorage.getItem('bred.session.v1'))
  await p1.goto(APP); await p1.getByText('Your responses have been successfully submitted').waitFor()
  ok('reopening after completion shows the thank-you screen (no duplicate submission)', !!stored)
  await ctx1.close()

  console.log('\n== Participant 2 (phone viewport) ==')
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const p2 = await ctx2.newPage()
  await journey(p2, 'mobile', { shot: true })
  const sw = await p2.evaluate(() => document.documentElement.scrollWidth)
  ok('no horizontal scrolling on a 375px phone', sw <= 376)
  await ctx2.close()

  console.log('\n== Consent branching in the browser ==')
  const ctx3 = await browser.newContext({ viewport: { width: 1000, height: 800 } })
  const p3 = await ctx3.newPage()
  await p3.goto(APP); await click(p3, 'Continue'); await radio(p3, 'c1', 'yes'); await radio(p3, 'c2', 'no'); await radio(p3, 'c3', 'yes'); await click(p3, 'Continue')
  await p3.getByText('Thank you for your time').waitFor()
  ok('declining consent ends the questionnaire', true)
  await ctx3.close()
  const ctx4 = await browser.newContext()
  const p4 = await ctx4.newPage()
  await p4.goto(APP); await click(p4, 'Continue'); await radio(p4, 'c1', 'yes'); await radio(p4, 'c2', 'yes'); await radio(p4, 'c3', 'no'); await click(p4, 'Continue')
  await p4.getByText('only open to participants aged 18 or over').waitFor()
  ok('under-18 ends the questionnaire', true)
  await ctx4.close()

  console.log('\n== Admin dashboard ==')
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p5 = await ctx5.newPage()
  await p5.goto(`${APP}/#/admin`)
  await p5.getByRole('heading', { name: 'Researcher sign-in' }).waitFor()
  await p5.getByLabel('Email').fill('wrong@example.org'); await p5.getByLabel('Password').fill('nope'); await click(p5, 'Sign in')
  await p5.getByText('Sign-in failed').waitFor()
  ok('wrong admin credentials rejected', true)
  await p5.getByLabel('Email').fill(ADMIN_EMAIL); await p5.getByLabel('Password').fill(ADMIN_PASSWORD); await click(p5, 'Sign in')
  await p5.getByText('Experimental group allocation').waitFor(); await p5.screenshot({ path: `${SHOTS}/admin-overview.png`, fullPage: true })
  const tiles = await p5.locator('main .text-3xl').allInnerTexts()
  const dbCounts = (await sql(`select count(*)::int started, count(*) filter (where submission_status='completed')::int completed from public.participants where not is_test`))[0]
  ok('dashboard "Started" equals database count', Number(tiles[0]) === dbCounts.started)
  ok('dashboard "Completed" equals database count', Number(tiles[2]) === dbCounts.completed && dbCounts.completed === 2)

  // researcher test link forces condition 3 (negative + support)
  await p5.goto(`${APP}/?test_group=3`)
  await p5.getByText('Researcher test session').waitFor()
  const r5 = await journey(p5, 'forced3', {})
  const t = (await sql(`select experimental_condition c, framing_condition f, majority_condition m, is_test from public.participants where is_test`))[0]
  ok('forced test session got group 3 (negative framing, majority support) and is flagged as test', t.c === 3 && t.f === 'negative' && t.m === 'support' && t.is_test === true)
  ok('forced group 3 saw "support" statements on all 5 policies', r5.seen.every((x) => x.majority.includes('students support introducing')))
  const neg = await sql(`select framing_text from public.policy_framing_content where framing = 'negative'`)
  ok('forced group 3 saw negative framing on all 5 policies', r5.seen.every((x) => neg.some((n) => n.framing_text === x.framing)))

  await p5.goto(`${APP}/#/admin`)
  await p5.getByRole('button', { name: 'Participants' }).click()
  await p5.locator('tbody tr td .rounded-full').first().waitFor()
  await p5.screenshot({ path: `${SHOTS}/admin-participants.png`, fullPage: true })
  await p5.getByRole('button', { name: 'Analysis' }).click()
  await p5.getByText('No significance tests have been run').waitFor()
  await p5.screenshot({ path: `${SHOTS}/admin-analysis.png`, fullPage: true })
  ok('analysis tab shows descriptive-only disclaimer', true)
  await p5.getByRole('button', { name: 'Export data' }).click()
  const [dl] = await Promise.all([p5.waitForEvent('download'), p5.getByRole('button', { name: 'Download CSV' }).nth(2).click()])
  const path = await dl.path()
  const csv = (await import('node:fs')).readFileSync(path, 'utf8')
  const lines = csv.trim().split(/\r?\n/)
  ok('policy long CSV has header + 10 rows (2 completed participants x 5 policies; test excluded)', lines.length === 11 && lines[0].includes('change_in_support') && lines[0].includes('participant_id'))
  await p5.screenshot({ path: `${SHOTS}/admin-export.png`, fullPage: true })

  console.log('\n== Security in the browser ==')
  const anonRead = await ctx5.request.get('http://localhost:54321/rest/v1/participants?select=*', { headers: { apikey: 'anon-key' } })
  ok('anonymous REST read of participants is refused', anonRead.status() === 400 || anonRead.status() === 401 || anonRead.status() === 403)
  const ctx6 = await browser.newContext()
  const p6 = await ctx6.newPage()
  await p6.goto(`${APP}/#/admin`); await p6.getByRole('heading', { name: 'Researcher sign-in' }).waitFor()
  ok('participants cannot see the dashboard without signing in', true)
  await p6.goto(`${APP}/?test_group=2`); await click(p6, 'Continue')
  await p6.getByRole('heading', { name: 'Participant Information Sheet' }).waitFor()
  ok('?test_group has no effect for non-admins (no test banner)', (await p6.getByText('Researcher test session').count()) === 0)
  await ctx6.close(); await ctx5.close()

  console.log(`\nAll ${passed} E2E checks passed.`)
} catch (e) {
  console.error('FAILED: ' + String(e.message).split(String.fromCharCode(10)).slice(0, 8).join(' | '))
  process.exitCode = 1
} finally {
  await browser.close()
  vite.kill()
  if (process.platform === 'win32') await freePorts()
  await shim.close()
  process.exit(process.exitCode ?? 0)
}
