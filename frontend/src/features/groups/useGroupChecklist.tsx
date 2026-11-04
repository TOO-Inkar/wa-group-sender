import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useGroups } from './api'
import { GroupRows, GroupSelectAll } from './GroupList'
import { matches, sortGroups } from './model'
import { cn } from '@/shared/lib/cn'
import { Checkbox } from '@/shared/ui/input'
import { SearchInput } from '@/shared/ui/search-input'

const INSET = '-mx-4 [--row-x:1rem] sm:-mx-6 sm:[--row-x:1.5rem]'

export function useGroupChecklist(value: string[], onChange: (jids: string[]) => void): { toolbar: ReactNode; rows: ReactNode } {
  const { data: groups = [] } = useGroups()
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const selected = useMemo(() => new Set(value), [value])

  useEffect(() => {
    if (!groups.length) return
    const known = new Set(groups.map((g) => g.jid))
    if (value.some((jid) => !known.has(jid))) onChange(value.filter((jid) => known.has(jid)))
  }, [groups, value, onChange])
  const shown = sortGroups(groups.filter((g) => (!onlyActive || g.active) && matches(g, query)))

  const toggle = (jids: string[], on: boolean) => {
    const next = new Set(selected)
    jids.forEach((jid) => (on ? next.add(jid) : next.delete(jid)))
    onChange([...next])
  }

  return {
    toolbar: (
      <>
        <SearchInput value={query} onChange={setQuery} placeholder="Поиск по названию группы" />
        <Checkbox label="только группы из рассылки (в архиве)" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        <div className={INSET}>
          <GroupSelectAll groups={shown} selected={selected} onToggle={toggle} />
        </div>
      </>
    ),
    rows: (
      <div className={cn(INSET, '-my-4 sm:-mb-6')}>
        <GroupRows groups={shown} selected={selected} onToggle={toggle} empty="Ничего не найдено" />
      </div>
    ),
  }
}
