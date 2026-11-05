import type { Campaign } from '@/shared/api/types'
import { usePaging } from '@/shared/lib/paging'
import { Pager } from '@/shared/ui/pager'

const RECIPIENTS_PAGE = 10

export function Recipients({ label, targets }: { label: string; targets: Campaign['targets'] }) {
  const paging = usePaging(targets, { key: 'recipients', size: RECIPIENTS_PAGE })
  return (
    <div className="grid min-w-0 gap-1">
      <span className="font-medium">
        {label} · {targets.length}
      </span>
      <ul aria-label="Группы заявки" className="grid min-w-0 text-caption text-muted">
        {paging.visible.map((t) => (
          <li key={t.jid} className="truncate leading-6">
            {t.name}
          </li>
        ))}
      </ul>
      <Pager paging={paging} label="Страницы получателей" className="mt-1" />
    </div>
  )
}
