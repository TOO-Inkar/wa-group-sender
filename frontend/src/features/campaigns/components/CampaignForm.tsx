import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type KeyboardEvent } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { usePreview, useSaveCampaign } from '../api'
import { defaultValues, formSchema, previewBody, targetOf, toRequest, type FormValues } from '../form'
import { scheduleShort } from '../model'
import { ItemFields } from './ItemFields'
import { TextEditor } from './TextEditor'
import { WherePicker } from './WherePicker'
import { WhenPicker } from './WhenPicker'
import { useGroupLists } from '@/features/groups/api'
import { useHealth } from '@/features/health/api'
import type { Campaign } from '@/shared/api/types'
import { groupsCount, plural } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/hooks'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Caption, Input } from '@/shared/ui/input'
import { WhatsAppBubble } from '@/shared/ui/whatsapp-bubble'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

const DRAFT_KEY = 'wa-campaign-draft'
const FORM_ID = 'campaign-form'

function readDraft(): FormValues | null {
  try {
    const parsed = formSchema.safeParse(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const WHEN: Record<FormValues['repeat'], (v: FormValues) => string> = {
  now: () => 'сейчас',
  at: (v) => `в ${v.atTime}`,
  daily: (v) => scheduleShort({ repeatMode: 'DAILY', startTime: v.dailyTime, endTime: null, intervalMinutes: null }),
  interval: (v) => scheduleShort({ repeatMode: 'INTERVAL', startTime: v.intervalStart, endTime: v.intervalEnd, intervalMinutes: v.intervalMinutes }),
}

export function CampaignFormSheet({ campaign, initial, onClose }: { campaign?: Campaign; initial?: Partial<FormValues>; onClose: (saved?: Campaign) => void }) {
  const editing = !!campaign
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...defaultValues(), ...(editing ? {} : readDraft()), ...initial },
  })
  const save = useSaveCampaign(campaign?.id)
  const confirm = useConfirm()
  const { data: lists = [] } = useGroupLists()
  const { data: health } = useHealth()
  const values = useWatch({ control: form.control }) as FormValues
  const body = useDebounced(previewBody(values), 350)
  const preview = usePreview(body)

  useEffect(() => {
    if (editing) return
    const timer = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(values)), 400)
    return () => clearTimeout(timer)
  }, [values, editing])

  const target = targetOf(values, lists)
  const count = target.groups ? target.groups.length : (health?.activeGroups ?? 0)
  const where = target.label ?? (target.groups ? groupsCount(count) : `все группы (${count})`)
  const summary = `${where} · ${WHEN[values.repeat](values)}`

  const submit = form.handleSubmit(async (v) => {
    if (!editing && v.repeat === 'now') {
      const ok = await confirm({
        title: `Отправить в ${plural(count, 'группу', 'группы', 'групп')}?`,
        confirm: 'Отправить',
        body: preview.data ? <WhatsAppBubble text={preview.data} className="max-h-60 overflow-auto" /> : undefined,
      })
      if (!ok) return
    }
    save.mutate(toRequest(v, lists), {
      onSuccess: (saved) => {
        if (!editing) localStorage.removeItem(DRAFT_KEY)
        onClose(saved)
      },
      onError: (e) => form.setError('root', { message: e.message }),
    })
  })

  const editAsText = async () => {
    if (!preview.data) return
    if (values.text.trim() && !(await confirm({ title: 'Заменить текст в редакторе?', body: <p>Там уже есть сообщение — оно заменится собранным из полей.</p>, confirm: 'Заменить' }))) return
    form.setValue('text', preview.data)
    form.setValue('mode', 'text')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      void submit()
      return
    }
    const el = event.target as HTMLElement
    if (!el.hasAttribute('data-nav')) return
    if (event.shiftKey) {
      if (el.tagName !== 'TEXTAREA') event.preventDefault()
      return
    }
    event.preventDefault()
    const order = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-nav]')]
    order[order.indexOf(el) + 1]?.focus()
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? `№${campaign.id} · изменение` : 'Новая заявка'}
      width="max-w-5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-muted">
            → <b className="text-text">{summary}</b>
          </span>
          <span className="flex items-center gap-2">
            {form.formState.errors.root && <span className="text-sm text-danger">{form.formState.errors.root.message}</span>}
            {!editing && (
              <Button variant="ghost" onClick={() => form.reset(defaultValues())}>
                Очистить
              </Button>
            )}
            <Button type="submit" form={FORM_ID} variant="primary" disabled={save.isPending}>
              {editing ? 'Сохранить' : values.repeat === 'now' ? 'Отправить' : 'Запланировать'}
            </Button>
          </span>
        </div>
      }
    >
      <FormProvider {...form}>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form id={FORM_ID} onSubmit={submit} onKeyDown={onKeyDown} noValidate className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                size="sm"
                value={values.mode}
                onChange={(m) => form.setValue('mode', m)}
                options={[
                  { value: 'fields', label: 'По полям' },
                  { value: 'text', label: 'Готовый текст' },
                ]}
              />
              {values.mode === 'fields' && preview.data && body && (
                <button type="button" onClick={editAsText} className="cursor-pointer text-[13px] text-accent hover:underline">
                  Редактировать как текст →
                </button>
              )}
            </div>
            {values.mode === 'fields' ? <ItemFields /> : <TextEditor />}
            <div className="grid gap-2.5 sm:grid-cols-2">
              {values.mode === 'fields' && (
                <label className="grid gap-1">
                  <Caption>Контакт в конце</Caption>
                  <Input autoComplete="off" className="py-1.5" placeholder="Имя +7 7xx xxx xx xx" data-nav="" {...form.register('contact')} />
                </label>
              )}
              <label className="grid gap-1">
                <Caption>Название в списке</Caption>
                <Input autoComplete="off" className="py-1.5" maxLength={200} placeholder="по умолчанию — маршрут" data-nav="" {...form.register('title')} />
              </label>
            </div>
            <WherePicker />
            <WhenPicker />
          </form>
          <div className="sticky top-0 grid gap-1.5">
            <Caption>Как увидят в WhatsApp</Caption>
            {preview.data && body ? (
              <WhatsAppBubble text={preview.data} className="max-h-[70vh] overflow-auto" />
            ) : (
              <div className="grid min-h-40 place-items-center rounded-xl bg-chat-bg p-6 text-center text-sm text-muted">Здесь появится сообщение</div>
            )}
          </div>
        </div>
      </FormProvider>
    </Sheet>
  )
}
