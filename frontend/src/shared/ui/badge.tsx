import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { toneDot, toneSurface, type Tone } from './tone'

export type { Tone }

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', toneSurface[tone])}>
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cn('size-2 shrink-0 rounded-full', toneDot[tone])} />
}

export function Count({ value }: { value: number }) {
  return value ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-text tabular-nums">{value}</span> : null
}
