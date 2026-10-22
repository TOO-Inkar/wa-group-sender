import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useSaveSettings, useSettings } from './api'
import { autoReplyText } from './model'
import type { Settings } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { Card, CardTitle } from '@/shared/ui/card'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Checkbox, Field, Input, Textarea } from '@/shared/ui/input'
import { WhatsAppBubble } from '@/shared/ui/whatsapp-bubble'

type Values = Pick<Settings, 'autoReplyEnabled' | 'autoReplyRejectCalls' | 'autoReplyCooldownHours' | 'autoReplyText'>

function ReplyDialog({ settings, open, onOpenChange }: { settings: Settings; open: boolean; onOpenChange: (open: boolean) => void }) {
  const save = useSaveSettings()
  const form = useForm<Values>({ values: settings })
  const submit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, autoReplyCooldownHours: Number(values.autoReplyCooldownHours) },
      {
        onSuccess: () => {
          toast.success('Автоответчик сохранён')
          onOpenChange(false)
        },
        onError: (e) => form.setError('root', { message: e.message }),
      },
    ),
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Автоответчик" wide>
      <form onSubmit={submit} className="grid gap-3.5">
        <Checkbox label="Отвечать на личные сообщения" {...form.register('autoReplyEnabled')} />
        <Checkbox label="Отклонять звонки и отвечать тем же текстом" {...form.register('autoReplyRejectCalls')} />
        <Field label="Текст ответа">
          <Textarea rows={7} {...form.register('autoReplyText')} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            Одному человеку не чаще раза в <Input type="number" min={0} className="w-20" {...form.register('autoReplyCooldownHours')} /> ч
          </label>
          <Button variant="ghost" size="sm" onClick={() => form.setValue('autoReplyText', settings.defaultAutoReplyText)}>
            Стандартный текст
          </Button>
        </div>
        {form.formState.errors.root && <p className="text-sm text-danger">{form.formState.errors.root.message}</p>}
        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Сохранить
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function AutoReplyCard() {
  const { data: s } = useSettings()
  const [open, setOpen] = useState(false)
  if (!s) return <Card>Загрузка…</Card>
  return (
    <Card className="grid content-start gap-3">
      <CardTitle className="mb-0">Автоответчик</CardTitle>
      <p className="text-sm text-muted">{autoReplyText(s)}</p>
      <WhatsAppBubble text={s.autoReplyText} className="max-h-56 overflow-auto p-2.5" />
      <Button className="justify-self-start" onClick={() => setOpen(true)}>
        Изменить
      </Button>
      <ReplyDialog settings={s} open={open} onOpenChange={setOpen} />
    </Card>
  )
}
