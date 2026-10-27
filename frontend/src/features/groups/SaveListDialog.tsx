import { useState } from 'react'
import { toast } from 'sonner'
import { useSaveGroupList } from './api'
import type { GroupList } from '@/shared/api/types'
import { groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

const FORM_ID = 'save-group-list'

export function SaveListDialog({ groups, open, onOpenChange, onSaved }: { groups: string[]; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (list: GroupList) => void }) {
  const save = useSaveGroupList()
  const [name, setName] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Новый список групп"
      description={`${groupsCount(groups.length)}. Список с тем же названием заменится.`}
      footer={
        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!name.trim() || save.isPending}>
            Сохранить
          </Button>
        </DialogActions>
      }
    >
      <form
        id={FORM_ID}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          save.mutate(
            { name: name.trim(), groups },
            {
              onSuccess: (saved) => {
                toast.success(`Список «${saved.name}» сохранён`)
                setName('')
                onSaved(saved)
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }}
      >
        <Input autoFocus placeholder="Например, Тест" value={name} onChange={(e) => setName(e.target.value)} />
      </form>
    </Dialog>
  )
}
