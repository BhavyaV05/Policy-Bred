// The resume token is the participant's only credential. It is kept in this browser's
// localStorage so a refresh/closed tab resumes automatically, and can be copied by the
// participant to resume on another device. No names/emails are ever involved.
const KEY = 'bred.session.v1'
const DRAFT = 'bred.demographics.draft.v1'
const FORCE = 'bred.test.force.v1'

function safe<T>(f: () => T, fallback: T): T {
  try { return f() } catch { return fallback }
}

export const session = {
  get: () => safe(() => localStorage.getItem(KEY), null as string | null),
  set: (t: string) => safe(() => localStorage.setItem(KEY, t), undefined),
  clear: () => safe(() => { localStorage.removeItem(KEY); localStorage.removeItem(DRAFT) }, undefined),
  getDraft: <T,>(): T | null => safe(() => { const s = localStorage.getItem(DRAFT); return s ? (JSON.parse(s) as T) : null }, null as T | null),
  setDraft: (v: unknown) => safe(() => localStorage.setItem(DRAFT, JSON.stringify(v)), undefined),
  clearDraft: () => safe(() => localStorage.removeItem(DRAFT), undefined),
  getForce: (): number | null => safe(() => { const v = sessionStorage.getItem(FORCE); return v ? Number(v) : null }, null as number | null),
  setForce: (n: number) => safe(() => sessionStorage.setItem(FORCE, String(n)), undefined),
  clearForce: () => safe(() => sessionStorage.removeItem(FORCE), undefined),
}

/** Show a token as XXXX-XXXX-... for easy copying. */
export const formatToken = (t: string) => t.replace(/(.{4})(?=.)/g, '$1-').toUpperCase()
