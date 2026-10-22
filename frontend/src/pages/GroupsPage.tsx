import { RefreshCw, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useDeleteGroupList, useGroupLists, useGroups, useSyncGroups } from '@/features/groups/api'
import { GroupTable } from '@/features/groups/GroupTable'
import { matches, matchesGroupFilter, sortGroups, type GroupFilter } from '@/features/groups/model'
import { SaveListDialog } from '@/features/groups/SaveListDialog'
import { formatTime, groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Input, Select } from '@/shared/ui/input'
import { RowMenu } from '@/shared/ui/menu'
import { Segmented } from '@/shared/ui/segmented'

export function GroupsPage() {
  const { data: groups = [] } = useGroups()
  const { data: lists = [] } = useGroupLists()
  const sync = useSyncGroups()
  const deleteList = useDeleteGroupList()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GroupFilter>('all')
  const [listId, setListId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [naming, setNaming] = useState(false)

  const list = lists.find((l) => String(l.id) === listId)
  const count = (f: GroupFilter) => groups.filter((g) => matchesGroupFilter(g, f, selected)).length
  const shown = sortGroups(groups.filter((g) => matchesGroupFilter(g, filter, selected) && (!list || list.groups.includes(g.jid)) && matches(g, query)))
  const lastSync = groups.reduce((max, g) => Math.max(max, Date.parse(g.lastSync)), 0)

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
      setListId('')
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Группы</h1>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все', count: groups.length },
            { value: 'active', label: 'В рассылке', count: count('active') },
            { value: 'blocked', label: 'Не в рассылке', count: count('blocked') },
            ...(selected.size ? [{ value: 'selected' as const, label: 'Отмеченные', count: selected.size }] : []),
          ]}
        />
        <span className="flex items-center gap-1">
          <Select className="py-1.5 text-sm" value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Список групп">
            <option value="">Все списки</option>
            {lists.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} · {l.groups.length}
              </option>
            ))}
          </Select>
          {list && (
            <RowMenu
              label="Действия со списком"
              items={[
                { label: 'Заявка в этот список', icon: <Send size={15} />, onSelect: () => navigate('/campaigns/new', { state: { target: 'list', listId: String(list.id) } }) },
                { label: 'Отметить его группы', onSelect: () => setSelected(new Set(list.groups)) },
                { label: 'Удалить список', icon: <Trash2 size={15} />, danger: true, onSelect: removeList },
              ]}
            />
          )}
        </span>
        <Input type="search" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full py-1.5 text-sm sm:ml-auto sm:w-56" />
        <Button
          size="sm"
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

      <GroupTable
        groups={shown}
        selected={selected}
        onToggle={toggle}
        empty={groups.length ? 'Ничего не найдено' : 'Групп пока нет — подключите номер и нажмите «Обновить».'}
      />

      {selected.size > 0 && (
        <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-xl">
          <span className="text-sm font-semibold">Отмечено {groupsCount(selected.size)}</span>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => navigate('/campaigns/new', { state: { target: 'pick', groups: [...selected] } })}>
              Заявка в отмеченные
            </Button>
            <Button size="sm" onClick={() => setNaming(true)}>
              Сохранить как список
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Сбросить
            </Button>
          </div>
        </div>
      )}

      <SaveListDialog
        groups={[...selected]}
        open={naming}
        onOpenChange={setNaming}
        onSaved={(saved) => {
          setNaming(false)
          setSelected(new Set())
          setListId(String(saved.id))
        }}
      />
    </>
  )
}
