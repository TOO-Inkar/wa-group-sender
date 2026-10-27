import { Pencil, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useDeleteGroupList, useGroupLists, useGroups, useResetRejections, useSyncGroups } from '@/features/groups/api'
import { GroupRows, GroupSelectAll } from '@/features/groups/GroupList'
import { ListComposer } from '@/features/groups/ListComposer'
import { matches, matchesGroupFilter, sortGroups, type GroupFilter } from '@/features/groups/model'
import { formatTime, groupsCount } from '@/shared/lib/format'
import { ActionBar } from '@/shared/ui/action-bar'
import { Button } from '@/shared/ui/button'
import { Chips } from '@/shared/ui/chips'
import { useConfirm } from '@/shared/ui/confirm-context'
import { RowMenu } from '@/shared/ui/menu'
import { SearchInput } from '@/shared/ui/search-input'
import { Segmented } from '@/shared/ui/segmented'

const ALL = 'all'

type Composing = { listId?: number; groups: string[] }

export function GroupsPage() {
  const { data: groups = [] } = useGroups()
  const { data: lists = [] } = useGroupLists()
  const sync = useSyncGroups()
  const deleteList = useDeleteGroupList()
  const reset = useResetRejections()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GroupFilter>('all')
  const [listKey, setListKey] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [composing, setComposing] = useState<Composing | null>(null)

  const list = lists.find((l) => String(l.id) === listKey)
  const scope = groups.filter((g) => (!list || list.groups.includes(g.jid)) && matches(g, query))
  const count = (f: GroupFilter) => scope.filter((g) => matchesGroupFilter(g, f, selected)).length
  const shown = sortGroups(scope.filter((g) => matchesGroupFilter(g, filter, selected)))
  const lastSync = groups.reduce((max, g) => Math.max(max, Date.parse(g.lastSync)), 0)
  const resetGroup = (jid: string) => reset.mutate(jid, { onSuccess: () => toast.success('Группа вернётся в рассылку') })

  const openList = (key: string) => {
    setListKey(key)
    setSelected(new Set())
  }

  const toggle = (jids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      jids.forEach((j) => (on ? next.add(j) : next.delete(j)))
      return next
    })

  const removeList = async () => {
    if (!list) return
    if (await confirm({ title: `Удалить список «${list.name}»?`, body: <p>Группы и заявки не изменятся.</p>, confirm: 'Удалить', danger: true })) {
      deleteList.mutate(list.id)
      openList(ALL)
    }
  }

  if (composing) {
    const editing = lists.find((l) => l.id === composing.listId)
    return (
      <ListComposer
        key={composing.listId ?? 'new'}
        list={editing}
        initial={composing.groups}
        onClose={(savedId) => {
          setComposing(null)
          setSelected(new Set())
          if (savedId !== undefined) setListKey(String(savedId))
        }}
      />
    )
  }

  return (
    <>
      <div className="mb-3 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Группы</h1>
          <Button
            disabled={sync.isPending}
            title={lastSync ? `Обновлено ${formatTime(lastSync)}` : undefined}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (r) => (r.done ? toast.success(`Обновлено: в рассылке ${r.active} из ${r.total}`) : toast.error('WhatsApp не подключён')),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} /> {sync.isPending ? 'Обновляем…' : 'Обновить'}
          </Button>
        </div>
        <Chips
          label="Списки групп"
          value={listKey}
          onChange={openList}
          options={[{ value: ALL, label: 'Все группы', count: groups.length }, ...lists.map((l) => ({ value: String(l.id), label: l.name, count: l.groups.length }))]}
          after={
            <Button variant="link" size="inline" className="shrink-0 px-2" onClick={() => setComposing({ groups: [] })}>
              <Plus size={15} /> Новый список
            </Button>
          }
        />
        {list && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="mr-auto min-w-0 truncate font-semibold">
              {list.name} <span className="font-normal text-muted">· {groupsCount(list.groups.length)}</span>
            </span>
            <Button variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'list', listId: String(list.id) } })}>
              <Send size={15} /> Заявка в список
            </Button>
            <Button onClick={() => setComposing({ listId: list.id, groups: list.groups })}>
              <Pencil size={15} /> Изменить состав
            </Button>
            <RowMenu bordered label="Действия со списком" items={[{ label: 'Удалить список', icon: <Trash2 size={15} />, danger: true, onSelect: removeList }]} />
          </div>
        )}
        <div className="grid gap-2 lg:grid-cols-2">
          <Segmented
            stretch
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все', count: scope.length },
              { value: 'active', label: 'В рассылке', count: count('active') },
              { value: 'blocked', label: 'Не в рассылке', count: count('blocked') },
              ...(selected.size ? [{ value: 'selected' as const, label: 'Отмеченные', count: selected.size }] : []),
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск по названию группы" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border">
          <GroupSelectAll groups={shown} selected={selected} onToggle={toggle} />
        </div>
        <GroupRows groups={shown} selected={selected} onToggle={toggle} onReset={resetGroup} empty={groups.length ? 'Ничего не найдено' : 'Групп пока нет — подключите номер и нажмите «Обновить».'} />
      </div>

      {selected.size > 0 && (
        <ActionBar title={`Отмечено ${groupsCount(selected.size)}`}>
          <Button size="sm" variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'pick', groups: [...selected] } })}>
            Заявка в отмеченные
          </Button>
          <Button size="sm" onClick={() => setComposing({ groups: [...selected] })}>
            Новый список из отмеченных
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Сбросить
          </Button>
        </ActionBar>
      )}
    </>
  )
}
