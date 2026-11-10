import { supabase } from './supabase'

export type Step =
  | 'consent' | 'demographics' | 'pretest' | 'game' | 'assign' | 'manipulation'
  | 'posttest' | 'posttest_extra' | 'checks' | 'debrief' | 'done'
  | 'ended_declined' | 'ended_ineligible' | 'ended_withdrawn'

export interface PreAnswer { policy_id: number; support: number; confidence: number | null; familiarity: number | null }
export interface ParticipantState {
  status: string
  step: Step
  is_test: boolean
  total_policies: number
  policy_order: number[] | null
  pre_completed: number
  exposures_completed: number
  post_completed: number
  position: number | null
  pre_answers?: PreAnswer[]
  game?: { attempts: number; max_attempts: number }
  last_attempt_correct?: boolean
}
export interface Policy { policy_id: number; short_name: string; title: string; description: string; content_version: string }
export interface Exposure {
  position: number; total: number; policy_id: number; title: string; description: string
  framing_text: string; majority_text: string
}

export class ApiError extends Error {
  code: string
  field?: string
  network: boolean
  constructor(code: string, network = false, field?: string) {
    super(code)
    this.code = code
    this.network = network
    this.field = field
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Listener = (status: 'retrying' | 'ok') => void
const listeners = new Set<Listener>()
export const onNetworkStatus = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }
const emit = (s: 'retrying' | 'ok') => listeners.forEach((l) => l(s))

/**
 * Calls a Postgres function. Transient network/5xx failures are retried with back-off
 * (every participant RPC is idempotent, so a retry can never double-record a response).
 */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}, retries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: { data: unknown; error: { message?: string; code?: string } | null; status: number }
    try {
      res = (await supabase.rpc(fn, args)) as typeof res
    } catch {
      res = { data: null, error: { message: 'Failed to fetch', code: '' }, status: 0 }
    }
    if (!res.error) {
      if (attempt > 0) emit('ok')
      return res.data as T
    }
    const msg = String(res.error.message ?? '')
    const isAppError = res.error.code === 'P0001' || /^(invalid_|wrong_step|out_of_sequence|already_|not_admin)/.test(msg)
    if (isAppError) {
      const [code, field] = msg.split(':')
      throw new ApiError(code, false, field)
    }
    const transient = res.status === 0 || res.status >= 500 || /fetch|network|timeout|Load failed/i.test(msg)
    if (!transient) throw new ApiError('server_error', false)
    if (attempt >= retries) throw new ApiError('network', true)
    emit('retrying')
    await sleep(Math.min(8000, 600 * 2 ** attempt))
  }
}

export const api = {
  getPolicies: () => rpc<Policy[]>('get_policies'),
  startSession: () => rpc<{ token: string; state: ParticipantState }>('start_session'),
  getState: (token: string) => rpc<ParticipantState>('get_state', { p_token: token }),
  submitConsent: (token: string, read: boolean, voluntary: boolean, age18: boolean) =>
    rpc<ParticipantState>('submit_consent', { p_token: token, p_read: read, p_voluntary: voluntary, p_age18: age18 }),
  submitDemographics: (token: string, data: Record<string, unknown>) =>
    rpc<ParticipantState>('submit_demographics', { p_token: token, p_data: data }),
  savePolicyResponse: (
    token: string, stage: 'pre' | 'post', policyId: number, support: number,
    confidence: number | null = null, familiarity: number | null = null,
  ) => rpc<ParticipantState>('save_policy_response', {
    p_token: token, p_stage: stage, p_policy_id: policyId, p_support: support,
    p_confidence: confidence, p_familiarity: familiarity,
  }),
  submitGame: (token: string, c: number, t: number, s: number) =>
    rpc<ParticipantState>('submit_game', { p_token: token, p_circles: c, p_triangles: t, p_squares: s }),
  assignCondition: (token: string, force: number | null) =>
    rpc<ParticipantState>('assign_condition', { p_token: token, p_force: force }),
  getExposure: (token: string, position: number) => rpc<Exposure>('get_exposure', { p_token: token, p_position: position }),
  completeExposure: (token: string, position: number) =>
    rpc<ParticipantState>('complete_exposure', { p_token: token, p_position: position }),
  submitPosttestSupplementary: (token: string, confidence: number, reconsideration: string, factor: string) =>
    rpc<ParticipantState>('submit_posttest_supplementary', {
      p_token: token, p_final_confidence: confidence, p_reconsideration: reconsideration, p_factor: factor,
    }),
  submitManipulationChecks: (token: string, data: Record<string, unknown>) =>
    rpc<ParticipantState>('submit_manipulation_checks', { p_token: token, p_data: data }),
  completeStudy: (token: string, comment: string) =>
    rpc<ParticipantState>('complete_study', { p_token: token, p_comment: comment }),
  withdraw: (token: string) => rpc<ParticipantState>('withdraw', { p_token: token }),
}
