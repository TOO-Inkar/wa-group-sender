import { zodResolver } from '@hookform/resolvers/zod'
import { Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useDispatchControl, useSaveSettings, useSettings } from './api'
import { dispatchControl, limitsText, windowText, type DispatchControl } from './model'
import { useHealth } from '@/features/health/api'
import type { Settings } from '@/shared/api/types'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardTitle } from '@/shared/ui/card'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Dialog, DialogActions } from '@/shared/ui/dialog'
import { Checkbox, Field, Input } from '@/shared/ui/input'

const n = z.coerce.number().int().min(0, 'Не меньше 0')
const schema = z
  .object({
    windowStart: z.string().regex(/^\d{2}:\d{2}$/, 'Время'),
    windowEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Время'),
    weekendsEnabled: z.boolean(),
    hourlyLimit: n,
    dailyLimit: n,
    warmupEnabled: z.boolean(),
    groupPauseMinSeconds: n,
    groupPauseMaxSeconds: n,
    waveSize: z.coerce.number().int().min(1, 'От 1'),
    wavePauseMinMinutes: n,
    wavePauseMaxMinutes: n,
    ownMessageGapMinutes: n,
  })
  .refine((v) => v.groupPauseMinSeconds <= v.groupPauseMaxSeconds, { path: ['groupPauseMaxSeconds'], message: '«до» меньше «от»' })
  .refine((v) => v.wavePauseMinMinutes <= v.wavePauseMaxMinutes, { path: ['wavePauseMaxMinutes'], message: '«до» меньше «от»' })

type Values = z.infer<typeof schema>

function WindowDialog({ settings, open, onOpenChange }: { settings: Settings; open: boolean; onOpenChange: (open: boolean) => void }) {
  const save = useSaveSettings()
  const form = useForm<z.input<typeof schema>, unknown, Values>({ resolver: zodResolver(schema), values: settings })
  const e = form.formState.errors
  const submit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => {
        toast.success('Настройки сохранены')
        onOpenChange(false)
      },
      onError: (err) => form.setError('root', { message: err.message }),
    }),
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Рабочее окно и лимиты">
      <form onSubmit={submit} noValidate className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="С" error={e.windowStart?.message}>
            <Input type="time" {...form.register('windowStart')} />
          </Field>
          <Field label="До" error={e.windowEnd?.message}>
            <Input type="time" {...form.register('windowEnd')} />
          </Field>
        </div>
        <Checkbox label="Рассылать и в выходные" {...form.register('weekendsEnabled')} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Лимит в час" hint="0 — без лимита" error={e.hourlyLimit?.message}>
            <Input type="number" min={0} {...form.register('hourlyLimit')} />
          </Field>
          <Field label="Лимит в день" hint="0 — без лимита" error={e.dailyLimit?.message}>
            <Input type="number" min={0} {...form.register('dailyLimit')} />
          </Field>
        </div>
        <Checkbox label="Прогрев нового номера" {...form.register('warmupEnabled')} />
        <details className="grid gap-3">
          <summary className="cursor-pointer text-sm text-muted">Паузы — меняйте осторожно</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Между группами, от, с" error={e.groupPauseMinSeconds?.message}>
              <Input type="number" min={0} {...form.register('groupPauseMinSeconds')} />
            </Field>
            <Field label="до, с" error={e.groupPauseMaxSeconds?.message}>
              <Input type="number" min={0} {...form.register('groupPauseMaxSeconds')} />
            </Field>
            <Field label="Волна, групп" error={e.waveSize?.message}>
              <Input type="number" min={1} {...form.register('waveSize')} />
            </Field>
            <Field label="После своего сообщения, мин" hint="0 — не проверять" error={e.ownMessageGapMinutes?.message}>
              <Input type="number" min={0} {...form.register('ownMessageGapMinutes')} />
            </Field>
            <Field label="Между волнами, от, мин" error={e.wavePauseMinMinutes?.message}>
              <Input type="number" min={0} {...form.register('wavePauseMinMinutes')} />
            </Field>
            <Field label="до, мин" error={e.wavePauseMaxMinutes?.message}>
              <Input type="number" min={0} {...form.register('wavePauseMaxMinutes')} />
            </Field>
          </div>
        </details>
        {e.root && <p className="text-sm text-danger">{e.root.message}</p>}
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

export function DispatchCard() {
  const { data: health } = useHealth()
  const { data: settings } = useSettings()
  const control = useDispatchControl()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const state = health ? dispatchControl(health.dispatcher) : null

  const apply = async (c: DispatchControl) => {
    if (c.confirm && !(await confirm({ title: c.confirm, confirm: 'Да, возобновить' }))) return
    control.mutate(c.action, { onSuccess: () => toast.success(c.action === 'pause' ? 'Рассылка на паузе' : 'Рассылка возобновлена') })
  }

  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="mb-0">Рассылка</CardTitle>
        {state && <Badge tone={state.tone}>{state.badge}</Badge>}
      </div>
      {state?.hint && <p className="text-sm text-muted">{state.hint}</p>}
      {state && (
        <Button className="justify-self-start" variant={state.action === 'resume' ? 'primary' : 'secondary'} disabled={control.isPending} onClick={() => apply(state)}>
          {state.action === 'pause' ? <Pause className="size-4" /> : <Play className="size-4" />}
          {state.label}
        </Button>
      )}
      {settings && (
        <button type="button" onClick={() => setOpen(true)} className="grid cursor-pointer gap-1.5 rounded-xl border border-border p-3 text-left hover:bg-surface-2">
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted">Рабочее окно</span>
            <b>{windowText(settings)}</b>
          </span>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted">Лимиты</span>
            <b className="text-right">{limitsText(settings)}</b>
          </span>
          <span className="text-[13px] text-accent">Изменить →</span>
        </button>
      )}
      {settings && <WindowDialog settings={settings} open={open} onOpenChange={setOpen} />}
    </Card>
  )
}
