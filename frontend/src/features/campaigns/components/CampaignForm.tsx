import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { usePreview, useSaveCampaign } from '../api'
import { defaultValues, formSchema, previewBody, targetOf, toRequest, type FormValues } from '../form'
import { ItemFields } from './ItemFields'
import { ScheduleSection } from './ScheduleSection'
import { TargetSection } from './TargetSection'
import { TextEditor } from './TextEditor'
import { useGroupLists } from '@/features/groups/api'
import { useHealth } from '@/features/health/api'
import { useSettings } from '@/features/settings/api'
import type { Campaign } from '@/shared/api/types'
import { plural } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { useConfirm } from '@/shared/ui/confirm'
import { Field, Input } from '@/shared/ui/input'
import { WhatsAppBubble } from '@/shared/ui/misc'

const DRAFT_KEY = 'wa-campaign-draft'

function readDraft(): FormValues | null {
  try {
    const parsed = formSchema.safeParse(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * Новая заявка или правка существующей. Черновик новой хранится в браузере, пока её не отправили.
 * Enter — следующее поле, Shift+Enter — новая строка, Ctrl+Enter — отправить.
 */
export function CampaignForm({ initial, campaign, onSaved }: { initial?: Partial<FormValues>; campaign?: Campaign; onSaved: (c: Campaign) => void }) {
  const editing = !!campaign
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...defaultValues(), ...(editing ? {} : readDraft()), ...initial },
  })
  const save = useSaveCampaign(campaign?.id)
  const confirm = useConfirm()
  const { data: lists = [] } = useGroupLists()
  const { data: health } = useHealth()
  const { data: settings } = useSettings()
  const values = useWatch({ control: form.control }) as FormValues
  const mode = values.mode

  const body = useDebounced(previewBody(values), 350)
  const preview = usePreview(body)

  useEffect(() => {
    if (editing) return
    const timer = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(values)), 400)
    return () => clearTimeout(timer)
  }, [values, editing])

  const windowText = settings
    ? `${settings.windowStart === settings.windowEnd ? 'круглосуточно' : `${settings.windowStart}–${settings.windowEnd}`} ${settings.weekendsEnabled ? 'ежедневно' : 'по будням'}`
    : 'в рабочее окно'

  const submit = form.handleSubmit(async (v) => {
    const target = targetOf(v, lists)
    const count = target.groups ? target.groups.length : (health?.activeGroups ?? 0)
    const where = target.label ? `список «${target.label}»` : target.groups ? plural(count, 'выбранная группа', 'выбранные группы', 'выбранных групп') : `все активные группы (${count})`
    const ok = await confirm({
      title: editing ? 'Сохранить изменения?' : v.repeat === 'now' ? `Отправить в ${plural(count, 'группу', 'группы', 'групп')}?` : 'Сохранить заявку?',
      confirm: editing ? 'Сохранить' : v.repeat === 'now' ? 'Отправить' : 'Сохранить',
      body: (
        <>
          <p>Куда: {where}.</p>
          {preview.data && <WhatsAppBubble text={preview.data} className="max-h-60 overflow-auto" />}
          {editing && <p>Идущая рассылка досылает прежний текст; новый уйдёт со следующей.</p>}
        </>
      ),
    })
    if (!ok) return
    save.mutate(toRequest(v, lists), {
      onSuccess: (saved) => {
        if (!editing) localStorage.removeItem(DRAFT_KEY)
        onSaved(saved)
      },
      onError: (e) => form.setError('root', { message: e.message }),
    })
  })

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      void submit()
      return
    }
    const target = event.target as HTMLElement
    if (!target.hasAttribute('data-nav')) return
    if (event.shiftKey) {
      if (target.tagName !== 'TEXTAREA') event.preventDefault()
      return
    }
    event.preventDefault()
    const order = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-nav]')]
    const next = order[order.indexOf(target) + 1]
    if (next) next.focus()
    else event.currentTarget.querySelector<HTMLElement>('button[type=submit]')?.focus()
  }

  return (
    <FormProvider {...form}>
      <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="grid gap-4">
            <div className="inline-flex justify-self-start rounded-xl bg-surface-2 p-0.5">
              {(['fields', 'text'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => form.setValue('mode', m)}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-sm ${mode === m ? 'bg-surface font-semibold shadow-sm' : 'text-muted'}`}
                >
                  {m === 'fields' ? 'По полям' : 'Готовый текст'}
                </button>
              ))}
            </div>

            {mode === 'fields' ? (
              <>
                <ItemFields />
                <Field label="Контакт в конце сообщения" hint="Пусто — строки с контактом не будет. В сообщении из нескольких заявок — один раз, в конце.">
                  <Input autoComplete="off" placeholder="Имя +7 7xx xxx xx xx" data-nav="" {...form.register('contact')} />
                </Field>
              </>
            ) : (
              <TextEditor />
            )}

            <Field label="Название заявки" hint="Необязательно — для списка заявок; по умолчанию маршрут.">
              <Input autoComplete="off" maxLength={200} data-nav="" {...form.register('title')} />
            </Field>

            <TargetSection />
            <ScheduleSection windowText={windowText} />

            {form.formState.errors.root && (
              <p role="alert" className="text-sm text-danger">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {!editing ? (
                <Button variant="ghost" onClick={() => form.reset(defaultValues())}>
                  Очистить форму
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" variant="primary" size="lg" disabled={save.isPending}>
                {editing ? 'Сохранить изменения' : values.repeat === 'now' ? 'Отправить' : 'Сохранить и запланировать'}
              </Button>
            </div>
            <p className="text-center text-[13px] text-muted">Enter — следующее поле · Shift+Enter — новая строка · Ctrl+Enter — отправить</p>
          </form>
        </Card>

        <div className="sticky top-4 grid gap-2.5">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-3.5 py-2.5 text-[13px] font-semibold text-muted">Предпросмотр</div>
            {preview.data && body ? (
              <WhatsAppBubble text={preview.data} className="min-h-44 rounded-none" />
            ) : (
              <div className="grid min-h-44 place-items-center bg-chat-bg p-6 text-center text-muted">Начните заполнять форму — здесь появится сообщение.</div>
            )}
          </Card>
          <p className="text-[13px] text-muted">Сообщения уходят не сразу, а по одному с паузами, {windowText}.</p>
        </div>
      </div>
    </FormProvider>
  )
}
