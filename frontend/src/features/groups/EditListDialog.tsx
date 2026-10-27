import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateGroupList } from './api'
import { GroupChecklist } from './GroupPickerDialog'
import type { GroupList } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog } from '@/shared/ui/dialog'
import { Field, Input } from '@/shared/ui/input'

const FORM_ID = 'edit-group-list'

export function EditListDialog({ list, open, onOpenChange }: { list: GroupList; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateGroupList()
  const [name, setName] = useState(list.name)
  const [groups, setGroups] = useState(list.groups)
  const valid = name.trim() !== '' && groups.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Изменить список"
      description="Заявки в этот список будут отправляться по новому составу со следующей рассылки."
      wide
      sheetOnPhone
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-sm text-muted">В списке {groupsCount(groups.length)}</span>
          <Button className="min-h-10" variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button className="min-h-10" type="submit" form={FORM_ID} variant="primary" disabled={!valid || update.isPending}>
            Сохранить
          </Button>
        </div>
      }
    >
      <form
        id={FORM_ID}
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
      </form>
    </Dialog>
  )
}
