import { Card } from '../../components/ui'
import { config } from '../../config'
import type { Step } from '../../lib/api'

export function Ended({ step }: { step: Step }) {
  const content: Record<string, { title: string; body: string }> = {
    done: {
      title: 'Your responses have been successfully submitted. Thank you for participating!',
      body: 'You may now close this page.',
    },
    ended_declined: {
      title: 'Thank you for your time',
      body: 'You have chosen not to take part, so no further questions will be asked. You may close this page.',
    },
    ended_ineligible: {
      title: 'Thank you for your interest',
      body: 'Unfortunately this study is only open to participants aged 18 or over, so you cannot continue. You may close this page.',
    },
    ended_withdrawn: {
      title: 'You have withdrawn from the study',
      body: 'The responses you had entered have been deleted. Thank you for your time. You may close this page.',
    },
  }
  const c = content[step] ?? content.done
  return (
    <div className="fade-in">
      <Card className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{c.title}</h1>
        <p className="mt-4 text-base text-slate-600">{c.body}</p>
        {step === 'done' && config.contactEmail && (
          <p className="mt-6 text-sm text-slate-500">Questions about the study? Contact {config.contactEmail}.</p>
        )}
      </Card>
    </div>
  )
}
