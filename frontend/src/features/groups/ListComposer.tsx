import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useGroupLists, useGroups, useSaveGroupList, useUpdateGroupList } from './api'
import { GroupRows, GroupSelectAll } from './GroupList'
import { matches, sortGroups } from './model'
import type { GroupList } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'
import { ActionBar } from '@/shared/ui/action-bar'
import { Button } from '@/shared/ui/button'
import { Field, Input } from '@/shared/ui/input'
import { SearchInput } from '@/shared/ui/search-input'
import { Segmented } from '@/shared/ui/segmented'

type Scope = 'all' | 'in' | 'out'

export function ListComposer({ list, initial, onClose }: { list?: GroupList; initial: string[]; onClose: (savedId?: number) => void }) {
  const { data: groups = [] } = useGroups()
  const { data: lists = [] } = useGroupLists()
  const create = useSaveGroupList()
  const update = useUpdateGroupList()
  const [name, setName] = useState(list?.name ?? '')
  const [draft, setDraft] = useState(() => new Set(initial))
  const [scope, setScope] = useState<Scope>('all')
  const [frozen, setFrozen] = useState(draft)
  const [query, setQuery] = useState('')

  const original = useMemo(() => new Set(list?.groups ?? []), [list])
  const known = groups.filter((g) => matches(g, query))
  const inScope = (jid: string) => (scope === 'in' ? frozen.has(jid) : scope === 'out' ? !frozen.has(jid) : true)
  const shown = sortGroups(known.filter((g) => inScope(g.jid)))
  const added = [...draft].filter((jid) => !original.has(jid)).length
  const removed = [...original].filter((jid) => !draft.has(jid)).length
  const trimmed = name.trim()
  const taken = lists.some((l) => l.name === trimmed && l.id !== list?.id)
  const changed = !list || added > 0 || removed > 0 || trimmed !== list.name
  const busy = create.isPending || update.isPending

  const toggle = (jids: string[], on: boolean) =>
    setDraft((prev) => {
      const next = new Set(prev)
      jids.forEach((jid) => (on ? next.add(jid) : next.delete(jid)))
      return next
    })

  const changeScope = (next: Scope) => {
    setFrozen(draft)
    setScope(next)
  }

  const save = () => {
    if (!trimmed) return toast.error('Введите название списка')
    if (taken) return toast.error(`Список «${trimmed}» уже есть`)
    if (!draft.size) return toast.error('Отметьте хотя бы одну группу')
    const options = {
      onSuccess: (saved: GroupList) => {
        toast.success(list ? `Список «${saved.name}» обновлён` : `Список «${saved.name}» создан`)
        onClose(saved.id)
      },
      onError: (err: Error) => toast.error(err.message),
    }
    if (list) update.mutate({ id: list.id, name: trimmed, groups: [...draft] }, options)
    else create.mutate({ name: trimmed, groups: [...draft] }, options)
  }

  return (
    <>
      <div className="mb-3 grid gap-2">
        <h1 className="text-xl font-semibold">{list ? 'Состав списка' : 'Новый список'}</h1>
        <Field label="Название списка" error={taken ? `Список «${trimmed}» уже есть` : undefined}>
          <Input autoFocus={!list} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Китай" aria-invalid={taken} />
        </Field>
        <div className="grid gap-2 lg:grid-cols-2">
          <Segmented
            stretch
            value={scope}
            onChange={changeScope}
            options={[
              { value: 'all', label: 'Все группы', count: known.length },
              { value: 'in', label: 'В списке', count: known.filter((g) => draft.has(g.jid)).length },
              { value: 'out', label: 'Не в списке', count: known.filter((g) => !draft.has(g.jid)).length },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск по названию группы" />
        </div>
      </div>

      <div className="mb-24 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border">
          <GroupSelectAll groups={shown} selected={draft} onToggle={toggle} />
        </div>
        <GroupRows groups={shown} selected={draft} onToggle={toggle} empty={scope === 'in' ? 'В списке пока нет групп — отметьте их во вкладке «Все группы».' : 'Ничего не найдено'} />
      </div>

      <ActionBar
        title={
          <>
            В списке {groupsCount(draft.size)}
            {list && (added > 0 || removed > 0) && (
              <span className="ml-2 font-normal text-muted tabular-nums">
                +{added} −{removed}
              </span>
            )}
          </>
        }
      >
        <Button size="sm" variant="ghost" onClick={() => onClose()}>
          Отмена
        </Button>
        <Button size="sm" variant="primary" disabled={busy || !changed} onClick={save}>
          {list ? 'Обновить список' : 'Создать список'}
        </Button>
      </ActionBar>
    </>
  )
}
