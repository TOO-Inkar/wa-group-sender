import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useGroupLists, useGroups, useSaveGroupList } from './api'
import { rememberGroupPick } from './lastPick'
import { matches, sendable, sortGroups } from './model'
import { GroupRow } from './GroupTags'
import { Button } from '@/shared/ui/button'
import { Dialog } from '@/shared/ui/dialog'
import { Checkbox, Input, Select } from '@/shared/ui/input'
import { SearchInput } from '@/shared/ui/search-input'

export function GroupChecklist({ value, onChange }: { value: string[]; onChange: (jids: string[]) => void }) {
  const { data: groups = [] } = useGroups()
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const selected = useMemo(() => new Set(value), [value])
  const shown = sortGroups(groups.filter((g) => (!onlyActive || g.active) && matches(g, query)))
  const selectable = shown.filter(sendable).map((g) => g.jid)
  const selectedShown = selectable.filter((jid) => selected.has(jid)).length
  const all = selectable.length > 0 && selectedShown === selectable.length

  const toggle = (jids: string[], on: boolean) => {
    const next = new Set(selected)
    jids.forEach((jid) => (on ? next.add(jid) : next.delete(jid)))
    onChange([...next])
  }

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 grid gap-1 bg-surface px-4 pt-1 pb-2 sm:-mx-5 sm:px-5">
        <SearchInput value={query} onChange={setQuery} placeholder="Поиск по названию группы" />
        <Checkbox label="только группы из рассылки (в архиве)" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-border pt-1">
          <label className="-mx-1.5 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm font-medium hover:bg-surface-2">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent"
              ref={(el) => {
                if (el) el.indeterminate = selectedShown > 0 && !all
              }}
              checked={all}
              disabled={!selectable.length}
              onChange={(e) => toggle(selectable, e.target.checked)}
            />
            Выбрать все
          </label>
          <span className="text-[13px] text-muted tabular-nums">
            Выбрано: {selectedShown} из {selectable.length}
          </span>
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {shown.length === 0 && <div className="p-6 text-center text-muted">Ничего не найдено</div>}
        {shown.map((g) => (
          <GroupRow key={g.jid} group={g} checked={selected.has(g.jid)} disabled={!sendable(g) && !selected.has(g.jid)} onChange={(on) => toggle([g.jid], on)} />
        ))}
      </div>
    </>
  )
}

function SavedLists({ value, onChange }: { value: string[]; onChange: (jids: string[]) => void }) {
  const { data: lists = [] } = useGroupLists()
  const save = useSaveGroupList()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim() || !value.length) return
    save.mutate(
      { name: name.trim(), groups: value },
      {
        onSuccess: (saved) => {
          toast.success(`Список «${saved.name}» сохранён`)
          setNaming(false)
          setName('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  if (naming) {
    return (
      <div className="flex flex-wrap gap-2">
        <Input
          autoFocus
          className="min-h-10 min-w-0 flex-1 basis-48"
          placeholder="Название списка"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button className="min-h-10" variant="primary" disabled={!name.trim() || save.isPending} onClick={submit}>
          Сохранить
        </Button>
        <Button className="min-h-10" variant="ghost" onClick={() => setNaming(false)}>
          Отмена
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        className="min-h-10 py-1.5 text-sm"
        aria-label="Сохранённые списки"
        value=""
        disabled={!lists.length}
        onChange={(e) => {
          const list = lists.find((l) => String(l.id) === e.target.value)
          if (list) onChange(list.groups)
        }}
      >
        <option value="">{lists.length ? 'Взять из списка…' : 'Сохранённых списков нет'}</option>
        {lists.map((l) => (
          <option key={l.id} value={String(l.id)}>
            {l.name} · {l.groups.length}
          </option>
        ))}
      </Select>
      <Button className="min-h-10" disabled={!value.length} onClick={() => setNaming(true)}>
        Сохранить список
      </Button>
    </div>
  )
}

export function GroupPickerDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string[]
  onChange: (jids: string[]) => void
}) {
  const close = (next: boolean) => {
    if (!next && value.length) rememberGroupPick(value)
    onOpenChange(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Выберите группы"
      wide
      sheetOnPhone
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-sm text-muted tabular-nums">Выбрано: {value.length}</span>
          <Button className="min-h-10" variant="ghost" disabled={!value.length} onClick={() => onChange([])}>
            Сбросить
          </Button>
          <Button className="min-h-10" variant="primary" onClick={() => close(false)}>
            Готово
          </Button>
        </div>
      }
    >
      <SavedLists value={value} onChange={onChange} />
      <GroupChecklist value={value} onChange={onChange} />
    </Dialog>
  )
}
