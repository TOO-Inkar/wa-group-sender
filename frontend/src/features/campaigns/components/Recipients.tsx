import { useState } from 'react'
import type { Campaign } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'

const PREVIEW_COUNT = 5

export function Recipients({ label, targets }: { label: string; targets: Campaign['targets'] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? targets : targets.slice(0, PREVIEW_COUNT)
  return (
    <div className="grid min-w-0 gap-1">
      <span className="font-medium">
        {label} · {targets.length}
      </span>
      <ul aria-label="Группы заявки" className="grid min-w-0 text-[13px] text-muted">
        {shown.map((t) => (
          <li key={t.jid} className="truncate leading-6">
            {t.name}
          </li>
        ))}
      </ul>
      {targets.length > PREVIEW_COUNT && (
        <Button variant="link" size="inline" className="justify-self-start" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть' : `Показать все ${targets.length}`}
        </Button>
      )}
    </div>
  )
}
