import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateGroupList } from './api'
import { GroupChecklist } from './GroupPickerDialog'
import type { GroupList } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Field, Input } from '@/shared/ui/input'

export function EditListDialog({ list, open, onOpenChange }: { list: GroupList; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateGroupList()
  const [name, setName] = useState(list.name)
  const [groups, setGroups] = useState(list.groups)
  const valid = name.trim() !== '' && groups.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Изменить список" description="Заявки в этот список будут отправляться по новому составу со следующей рассылки." wide>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
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
        }}
      >
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <GroupChecklist value={groups} onChange={setGroups} />
        <DialogActions>
          <span className="mr-auto text-sm text-muted">В списке {groupsCount(groups.length)}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || update.isPending}>
            Сохранить
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
