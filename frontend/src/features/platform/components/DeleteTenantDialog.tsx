import { useState } from 'react'
import { toast } from 'sonner'
import { useDeleteTenant, type TenantOverview } from '../api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Field, Input } from '@/shared/ui/input'

export function DeleteTenantDialog({ tenant, onClose, onDeleted }: { tenant: TenantOverview; onClose: () => void; onDeleted: () => void }) {
  const remove = useDeleteTenant()
  const [typed, setTyped] = useState('')
  const matches = typed.trim() === tenant.name

  const submit = () =>
    remove
      .mutateAsync({ id: tenant.id, confirmName: typed.trim() })
      .then(() => {
        toast.success(`Кабинет «${tenant.name}» удалён`)
        onDeleted()
      })
      .catch((e: Error) => toast.error(e.message))

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Удалить «${tenant.name}»?`}
      description="Удалятся группы, заявки, отчёты, настройки, пользователи и привязка номера. Отменить нельзя."
      footer={
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" disabled={!matches || remove.isPending} onClick={submit}>
            {remove.isPending ? 'Удаляем…' : 'Удалить навсегда'}
          </Button>
        </DialogActions>
      }
    >
      <Field label="Введите название кабинета для подтверждения" hint={tenant.name}>
        <Input
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches) submit()
          }}
        />
      </Field>
    </Dialog>
  )
}
