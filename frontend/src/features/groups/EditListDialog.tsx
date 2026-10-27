import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateGroupList } from './api'
import { useGroupChecklist } from './useGroupChecklist'
import type { GroupList } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Field, Input } from '@/shared/ui/input'

export function EditListDialog({ list, open, onOpenChange }: { list: GroupList; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateGroupList()
  const [name, setName] = useState(list.name)
  const [groups, setGroups] = useState(list.groups)
  const checklist = useGroupChecklist(groups, setGroups)
  const valid = name.trim() !== '' && groups.length > 0

  const save = () => {
    if (!valid) return
    update.mutate(
      { id: list.id, name: name.trim(), groups },
      {
        onSuccess: (saved) => {
          toast.success(`Список «${saved.name}» сохранён`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Изменить список"
      description="Заявки в этот список будут отправляться по новому составу со следующей рассылки."
      wide
      toolbar={
        <>
          <Field label="Название">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  save()
                }
              }}
            />
          </Field>
          {checklist.toolbar}
        </>
      }
      footer={
        <DialogActions>
          <span className="mr-auto text-sm text-muted">В списке {groupsCount(groups.length)}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button variant="primary" disabled={!valid || update.isPending} onClick={save}>
            Сохранить
          </Button>
        </DialogActions>
      }
    >
      {checklist.rows}
    </Dialog>
  )
}
