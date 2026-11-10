import { useId, type ReactNode } from 'react'
import type { Option } from '../content/instrument'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 ${className}`}>{children}</div>
}

export function Button({
  children, onClick, disabled, variant = 'primary', type = 'button', className = '',
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'; className?: string
}) {
  const styles = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-slate-300 disabled:text-slate-500',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-accent-600 hover:bg-accent-50 disabled:text-slate-400',
    danger: 'bg-rose-700 text-white hover:bg-rose-800 disabled:bg-slate-300',
  }[variant]
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 text-base font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label ?? 'Progress'}</span><span>{p}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label="Questionnaire progress">
        <div className="h-full rounded-full bg-accent-500 transition-[width] duration-300" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' }) {
  const t = { info: 'border-accent-200 bg-accent-50 text-slate-700', warn: 'border-amber-200 bg-amber-50 text-amber-900', error: 'border-rose-200 bg-rose-50 text-rose-900' }[tone]
  return <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-xl border px-4 py-3 text-sm ${t}`}>{children}</div>
}

export function QuestionLabel({ children, required, optional }: { children: ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <div className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
      {children}
      {required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
      {optional && <span className="ml-2 align-middle text-xs font-normal text-slate-500">(optional)</span>}
    </div>
  )
}

/** Vertical list of large selectable options. */
export function RadioList({
  name, options, value, onChange, legend,
}: { name: string; options: Option[]; value: string | null | undefined; onChange: (v: string) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2">
        {options.map((o) => {
          const sel = value === o.value
          return (
            <label key={o.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base transition-colors ${sel ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <input type="radio" name={name} value={o.value} checked={sel} onChange={() => onChange(o.value)} className="h-5 w-5 shrink-0 accent-[#2f5f9e]" />
              <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Scale where every point has a text label (e.g. 7-point support scale).
 * Desktop: seven horizontal tiles. Mobile: stacked rows with the number and meaning.
 */
export function LabeledScale({
  name, labels, value, onChange, legend,
}: { name: string; labels: string[]; value: number | null | undefined; onChange: (v: number) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-2">
        {labels.map((label, i) => {
          const n = i + 1
          const sel = value === n
          return (
            <label key={n} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:min-h-[104px] sm:flex-col sm:justify-start sm:gap-2 sm:px-1.5 sm:py-3 sm:text-center ${sel ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <input type="radio" name={name} value={n} checked={sel} onChange={() => onChange(n)} className="h-5 w-5 shrink-0 accent-[#2f5f9e] sm:h-4 sm:w-4" />
              <span className={`w-5 shrink-0 text-lg font-semibold sm:w-auto ${sel ? 'text-accent-700' : 'text-slate-700'}`}>{n}</span>
              <span className="text-sm leading-tight text-slate-600 sm:text-xs">{label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Numbered scale (1..max) with captions for the end points. */
export function NumberScale({
  name, max, low, high, value, onChange, legend,
}: { name: string; max: number; low: string; high: string; value: number | null | undefined; onChange: (v: number) => void; legend: string }) {
  const nums = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex gap-1.5 sm:gap-2">
        {nums.map((n) => {
          const sel = value === n
          return (
            <label key={n} className={`flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-xl border text-base font-semibold transition-colors ${sel ? 'border-accent-500 bg-accent-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <input type="radio" name={name} value={n} checked={sel} onChange={() => onChange(n)} className="sr-only" />
              {n}
            </label>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs text-slate-500">
        <span>1 — {low}</span>
        <span className="text-right">{max} — {high}</span>
      </div>
    </fieldset>
  )
}

export function Section({ children }: { children: ReactNode }) {
  return <div className="fade-in space-y-6">{children}</div>
}

export function Field({ label, children, required, optional }: { label: ReactNode; children: ReactNode; required?: boolean; optional?: boolean }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="py-4 first:pt-0">
      <div id={id}><QuestionLabel required={required} optional={optional}>{label}</QuestionLabel></div>
      {children}
    </div>
  )
}
