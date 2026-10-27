import { useState } from 'react'
import { toast } from 'sonner'
import { useGroupLists, useSaveGroupList } from './api'
import { rememberGroupPick } from './lastPick'
import { useGroupChecklist } from './useGroupChecklist'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Input, Select } from '@/shared/ui/input'

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
          className="min-w-0 flex-1 basis-48"
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
        <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={submit}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={() => setNaming(false)}>
          Отмена
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Select
        block
        className="text-sm"
        aria-label="Сохранённые списки"
        value=""
        disabled={!lists.length}
        onChange={(e) => {
          const list = lists.find((l) => String(l.id) === e.target.value)
          if (list) onChange(list.groups)
        }}
      >
        <option value="">{lists.length ? 'Из списка…' : 'Списков нет'}</option>
        {lists.map((l) => (
          <option key={l.id} value={String(l.id)}>
            {l.name} · {l.groups.length}
          </option>
        ))}
      </Select>
      <Button className="shrink-0" disabled={!value.length} onClick={() => setNaming(true)}>
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

  const checklist = useGroupChecklist(value, onChange)

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Выберите группы"
      wide
      toolbar={
        <>
          <SavedLists value={value} onChange={onChange} />
          {checklist.toolbar}
        </>
      }
      footer={
        <DialogActions>
          <span className="mr-auto text-sm text-muted tabular-nums">Выбрано: {value.length}</span>
          <Button variant="ghost" disabled={!value.length} onClick={() => onChange([])}>
            Сбросить
          </Button>
          <Button variant="primary" onClick={() => close(false)}>
            Готово
          </Button>
        </DialogActions>
      }
    >
      {checklist.rows}
    </Dialog>
  )
}
