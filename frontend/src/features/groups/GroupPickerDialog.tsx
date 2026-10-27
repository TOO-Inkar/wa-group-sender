import { useMemo, useState } from 'react'
import { useGroups } from './api'
import { matches, sendable, sortGroups } from './model'
import { GroupName, GroupTags } from './GroupTags'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Checkbox, Input } from '@/shared/ui/input'

export function GroupChecklist({ value, onChange }: { value: string[]; onChange: (jids: string[]) => void }) {
  const { data: groups = [] } = useGroups()
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const selected = useMemo(() => new Set(value), [value])
  const shown = sortGroups(groups.filter((g) => (!onlyActive || g.active) && matches(g, query)))

  const toggle = (jid: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(jid)
    else next.delete(jid)
    onChange([...next])
  }

  return (
    <>
      <Input type="search" placeholder="Поиск по названию группы" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Checkbox label="только группы из рассылки (в архиве)" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
      <div className="max-h-[min(48vh,420px)] overflow-auto rounded-xl border border-border">
        {shown.length === 0 && <div className="p-6 text-center text-muted">Ничего не найдено</div>}
        {shown.map((g) => (
          <label
            key={g.jid}
            className={cn('flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2', !sendable(g) && 'cursor-default opacity-55')}
          >
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={selected.has(g.jid)}
              disabled={!sendable(g) && !selected.has(g.jid)}
              onChange={(e) => toggle(g.jid, e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <GroupName group={g} />
            </span>
            <GroupTags group={g} />
          </label>
        ))}
      </div>
    </>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Выберите группы" wide>
      <GroupChecklist value={value} onChange={onChange} />
      <DialogActions>
        <span className="mr-auto text-sm text-muted">Выбрано: {value.length}</span>
        <Button variant="ghost" onClick={() => onChange([])}>
          Сбросить
        </Button>
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          Готово
        </Button>
      </DialogActions>
    </Dialog>
  )
}
