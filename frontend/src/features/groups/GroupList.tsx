import type { ReactNode } from 'react'
import { GroupRow } from './GroupTags'
import { sendable } from './model'
import type { Group } from '@/shared/api/types'
import { EmptyState } from '@/shared/ui/empty-state'
import { CheckboxInput } from '@/shared/ui/input'
import { usePaging } from '@/shared/lib/paging'
import { Pager } from '@/shared/ui/pager'

type Toggle = (jids: string[], on: boolean) => void

const GROUPS_PAGE = 25

function selectableJids(groups: Group[], selected: Set<string>): string[] {
  return groups.filter((g) => sendable(g) || selected.has(g.jid)).map((g) => g.jid)
}

export function GroupSelectAll({ groups, selected, onToggle }: { groups: Group[]; selected: Set<string>; onToggle: Toggle }) {
  const jids = selectableJids(groups, selected)
  const checked = jids.filter((jid) => selected.has(jid)).length
  const all = jids.length > 0 && checked === jids.length

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 px-[var(--row-x,0.75rem)]">
      <label className="flex min-h-control cursor-pointer items-center gap-3 text-sm font-medium">
        <CheckboxInput checked={all} indeterminate={checked > 0} disabled={!jids.length} onChange={(e) => onToggle(jids, e.target.checked)} />
        Выбрать все
      </label>
      <span className="text-caption text-muted tabular-nums">
        Выбрано: {checked} из {jids.length}
      </span>
    </div>
  )
}

export function GroupRows({
  groups,
  selected,
  onToggle,
  onReset,
  empty,
  pageKey,
  reset,
}: {
  groups: Group[]
  selected: Set<string>
  onToggle: Toggle
  onReset?: (jid: string) => void
  empty: ReactNode
  pageKey: string
  reset: string
}) {
  const paging = usePaging(groups, { key: pageKey, size: GROUPS_PAGE, reset })
  if (!groups.length) return <EmptyState inset>{empty}</EmptyState>
  return (
    <>
      <div className="divide-y divide-border">
        {paging.visible.map((g) => (
          <GroupRow
            key={g.jid}
            group={g}
            checked={selected.has(g.jid)}
            disabled={!sendable(g) && !selected.has(g.jid)}
            onChange={(on) => onToggle([g.jid], on)}
            onReset={onReset}
          />
        ))}
      </div>
      <Pager paging={paging} label="Страницы групп" className="border-t border-border px-[var(--row-x,0.75rem)] py-2" />
    </>
  )
}
