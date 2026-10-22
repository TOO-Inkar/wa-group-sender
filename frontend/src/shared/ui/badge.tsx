import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-muted',
  ok: 'bg-ok-bg text-ok-text',
  warn: 'bg-warn-bg text-warn-text',
  bad: 'bg-bad-bg text-bad-text',
  info: 'bg-info-bg text-info-text',
}

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  )
}
