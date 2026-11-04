import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { toneDot, toneSurface, type Tone } from './tone'

export type { Tone }

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap', toneSurface[tone])}>
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cn('size-2 shrink-0 rounded-full', toneDot[tone])} />
}

export function Count({ value }: { value: number }) {
  return value ? <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs leading-none font-semibold text-accent-text tabular-nums">{value}</span> : null
}
