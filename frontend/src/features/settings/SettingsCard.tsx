import type { ReactNode } from 'react'
import { Card, CardTitle } from '@/shared/ui/card'

export function SettingsCard({ title, aside, children, actions }: { title: ReactNode; aside?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="mb-0">{title}</CardTitle>
        {aside}
      </div>
      {children ?? <CardNote>Загрузка…</CardNote>}
      {actions && <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </Card>
  )
}

export function CardNote({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted">{children}</p>
}
