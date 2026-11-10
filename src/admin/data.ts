import { supabase } from '../lib/supabase'

export type Row = Record<string, any>

/** Reads an entire admin view (PostgREST caps responses at 1000 rows, so page through it). */
export async function fetchAll(view: string, orderBy: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(view).select('*').order(orderBy, { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export const GROUP_LABEL: Record<number, string> = {
  1: 'Group 1 · Positive + Support',
  2: 'Group 2 · Positive + Opposition',
  3: 'Group 3 · Negative + Support',
  4: 'Group 4 · Negative + Opposition',
}
export const POLICY_LABEL: Record<number, string> = {
  1: 'Compulsory TA tutorials',
  2: 'Strict examination leave',
  3: 'Continuous assessment',
  4: 'Late-start schedule',
  5: 'Non-veg food in all messes',
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(d))

export interface PolicySummary { policy_id: number; n: number; pre: number | null; post: number | null; change: number | null }
export interface CellSummary { key: string; label: string; n: number; change: number | null }

/** Descriptive statistics only. No inferential test is run or implied. */
export function analyse(long: Row[]) {
  const usable = long.filter((r) => r.is_complete && !r.is_test && r.pre_support != null && r.post_support != null)
  const byPolicy: PolicySummary[] = [1, 2, 3, 4, 5].map((id) => {
    const rows = usable.filter((r) => r.policy_id === id)
    return {
      policy_id: id, n: rows.length,
      pre: mean(rows.map((r) => r.pre_support)), post: mean(rows.map((r) => r.post_support)),
      change: mean(rows.map((r) => r.change_in_support)),
    }
  })

  // One mean-change value per participant (average of their five policies) so the 5 repeated
  // observations per person are not treated as 250 independent participants.
  const perParticipant = new Map<string, { framing: string; majority: string; group: number; changes: number[] }>()
  for (const r of usable) {
    const p = perParticipant.get(r.participant_id) ?? { framing: r.framing_condition as string, majority: r.majority_condition as string, group: r.experimental_group as number, changes: [] as number[] }
    p.changes.push(r.change_in_support)
    perParticipant.set(r.participant_id, p)
  }
  const people = [...perParticipant.values()].map((p) => ({ ...p, mean: mean(p.changes)! }))
  const summarise = (keyOf: (p: (typeof people)[number]) => string, labels: [string, string][]): CellSummary[] =>
    labels.map(([key, label]) => {
      const ps = people.filter((p) => keyOf(p) === key)
      return { key, label, n: ps.length, change: mean(ps.map((p) => p.mean)) }
    })

  return {
    participants: people.length,
    byPolicy,
    byFraming: summarise((p) => p.framing, [['positive', 'Positive framing'], ['negative', 'Negative framing']]),
    byMajority: summarise((p) => p.majority, [['support', 'Majority support'], ['opposition', 'Majority opposition']]),
    byGroup: summarise((p) => String(p.group), [1, 2, 3, 4].map((g) => [String(g), GROUP_LABEL[g]] as [string, string])),
    // policy x group means (each cell = mean change across participants in that group)
    policyByGroup: [1, 2, 3, 4, 5].map((id) => ({
      policy_id: id,
      cells: [1, 2, 3, 4].map((g) => {
        const rows = usable.filter((r) => r.policy_id === id && r.experimental_group === g)
        return { group: g, n: rows.length, change: mean(rows.map((r) => r.change_in_support)) }
      }),
    })),
  }
}
