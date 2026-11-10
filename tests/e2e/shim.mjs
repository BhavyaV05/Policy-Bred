// Local stand-in for Supabase (PostgREST + GoTrue subset) backed by the REAL migrations in PGlite.
// Used only for automated browser tests; production uses real Supabase.
//   node tests/e2e/shim.mjs   (listens on :54321)
import http from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migDir = join(here, '..', '..', 'supabase', 'migrations')
export const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
export const ADMIN_EMAIL = 'researcher@example.org'
export const ADMIN_PASSWORD = 'correct horse battery'

export async function createShim(port = 54321) {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, extensions to anon, authenticated;`)
  for (const f of readdirSync(migDir).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'))
  await db.exec(`insert into public.admin_users (user_id) values ('${ADMIN_ID}')`)

  let chain = Promise.resolve()
  const locked = (fn) => (chain = chain.then(fn, fn))
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = (role, sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, sub, aud: 'authenticated', exp: 4102444800, iat: 1700000000 })}.sig`

  const lit = (v) => v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
    : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`

  const server = http.createServer(async (req, res) => {
    const cors = {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      'access-control-expose-headers': '*',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
    const url = new URL(req.url, 'http://x')
    let body = ''
    for await (const c of req) body += c
    const json = (status, obj, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...cors, ...extra }); res.end(JSON.stringify(obj)) }
    const auth = (req.headers.authorization || '').replace('Bearer ', '')
    let role = 'anon', sub = ''
    try { const p = JSON.parse(Buffer.from(auth.split('.')[1] || '', 'base64url').toString()); if (p.role === 'authenticated') { role = 'authenticated'; sub = p.sub } } catch { /* anon */ }

    const run = (sql) => locked(async () => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role}`)
      try { return await db.query(sql) } finally { await db.exec('reset role') }
    })

    try {
      // ---- GoTrue subset
      if (url.pathname === '/auth/v1/token') {
        const b = JSON.parse(body || '{}')
        if (b.email === ADMIN_EMAIL && b.password === ADMIN_PASSWORD) {
          const user = { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: ADMIN_EMAIL, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
          return json(200, { access_token: jwt('authenticated', ADMIN_ID), token_type: 'bearer', expires_in: 3600000, refresh_token: 'r', user })
        }
        return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      }
      if (url.pathname === '/auth/v1/logout') { res.writeHead(204, cors); return res.end() }

      // ---- test-only helpers
      if (url.pathname === '/__sql') {
        const r = await locked(async () => db.query(JSON.parse(body).sql))
        return json(200, r.rows)
      }

      // ---- RPC
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
      if (m) {
        const args = JSON.parse(body || '{}')
        const fn = m[1]
        const sql = `select public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')}) as r`
        const r = await run(sql)
        return json(200, r.rows[0].r)
      }

      // ---- table / view reads
      const t = url.pathname.match(/^\/rest\/v1\/(\w+)$/)
      if (t && req.method === 'GET') {
        const order = url.searchParams.get('order')
        const [col, dir] = order ? order.split('.') : [null, 'asc']
        const limit = Number(url.searchParams.get('limit') ?? 1000), offset = Number(url.searchParams.get('offset') ?? 0)
        const sql = `select * from public.${t[1]} ${col ? `order by ${col} ${dir === 'desc' ? 'desc' : 'asc'}` : ''} limit ${limit} offset ${offset}`
        const r = await run(sql)
        return json(200, r.rows)
      }
      json(404, { message: 'not found' })
    } catch (e) {
      const msg = String(e.message || e)
      json(400, { code: /permission denied/.test(msg) ? '42501' : 'P0001', message: msg, details: null, hint: null })
    }
  })
  await new Promise((r) => server.listen(port, r))
  return { db, server, close: () => new Promise((r) => server.close(r)) }
}

if (process.argv[1] && process.argv[1].endsWith('shim.mjs')) {
  await createShim()
  console.log('shim listening on http://localhost:54321')
}
