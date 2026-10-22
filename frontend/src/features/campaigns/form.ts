import { z } from 'zod'
import type { Campaign, CampaignForm, GroupList, RequestItem } from '@/shared/api/types'

/** Поля одной заявки в порядке формы: Груз, Доп. условия и Фрахт последним. */
export const ITEM_FIELDS = ['route', 'date', 'vehicles', 'cargo', 'conditions', 'freight'] as const
export type ItemField = (typeof ITEM_FIELDS)[number]

export const ITEM_LABELS: Record<ItemField, { title: string; placeholder: string; required: boolean; rows?: number; hint?: string }> = {
  route: { title: 'Маршрут', placeholder: 'ХОРГОС → БАКУ', required: true },
  date: { title: 'Дата / срочность', placeholder: 'Срочно, груз готов', required: true },
  vehicles: { title: 'Машины и тоннаж', placeholder: '120 м³ / 5 осей — 20 т', required: true, rows: 3, hint: 'Каждая строка — отдельная строка сообщения (Shift+Enter).' },
  cargo: { title: 'Груз', placeholder: 'Цемент', required: true },
  conditions: { title: 'Доп. условия', placeholder: 'Необязательно', required: false, rows: 2 },
  freight: { title: 'Фрахт', placeholder: '450 000 ₸', required: true },
}

const item = z.object({
  route: z.string(),
  date: z.string(),
  vehicles: z.string(),
  cargo: z.string(),
  conditions: z.string(),
  freight: z.string(),
})

export type Item = z.infer<typeof item>

export const emptyItem = (): Item => ({ route: '', date: '', vehicles: '', cargo: '', conditions: '', freight: '' })

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Укажите время')

export const formSchema = z
  .object({
    mode: z.enum(['fields', 'text']),
    items: z.array(item).min(1),
    text: z.string(),
    contact: z.string(),
    title: z.string().max(200),
    target: z.enum(['all', 'list', 'pick']),
    listId: z.string(),
    groups: z.array(z.string()),
    repeat: z.enum(['now', 'at', 'daily', 'interval']),
    atTime: time,
    dailyTime: time,
    intervalMinutes: z.number().int().min(30),
    intervalStart: time,
    intervalEnd: time,
    sendNow: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'text') {
      if (!v.text.trim()) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Вставьте текст сообщения' })
    } else {
      const filled = v.items.map((it, i) => ({ it, i })).filter(({ it }) => ITEM_FIELDS.some((f) => it[f].trim()))
      if (!filled.length) ctx.addIssue({ code: 'custom', path: ['items', 0, 'route'], message: 'Заполните заявку' })
      for (const { it, i } of filled) {
        for (const field of ITEM_FIELDS) {
          if (ITEM_LABELS[field].required && !it[field].trim()) {
            ctx.addIssue({ code: 'custom', path: ['items', i, field], message: 'Обязательное поле' })
          }
        }
      }
    }
    if (v.target === 'list' && !v.listId) ctx.addIssue({ code: 'custom', path: ['listId'], message: 'Выберите список групп' })
    if (v.target === 'pick' && !v.groups.length) ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Выберите хотя бы одну группу' })
    if (v.repeat === 'interval' && v.intervalEnd <= v.intervalStart) {
      ctx.addIssue({ code: 'custom', path: ['intervalEnd'], message: 'Конец позже начала' })
    }
  })

export type FormValues = z.infer<typeof formSchema>

export const defaultValues = (): FormValues => ({
  mode: 'fields',
  items: [emptyItem()],
  text: '',
  contact: '',
  title: '',
  target: 'all',
  listId: '',
  groups: [],
  repeat: 'now',
  atTime: '05:00',
  dailyTime: '05:00',
  intervalMinutes: 120,
  intervalStart: '08:00',
  intervalEnd: '23:00',
  sendNow: true,
})

function filledItems(items: Item[]): RequestItem[] {
  return items.filter((it) => ITEM_FIELDS.some((f) => it[f].trim())).map((it) => ({ ...it, conditions: it.conditions || null }))
}

/** Тело для предпросмотра: то, что уйдёт текстом. */
export function previewBody(v: Pick<FormValues, 'mode' | 'items' | 'text' | 'contact'>) {
  if (v.mode === 'text') return v.text.trim() ? { text: v.text } : null
  const items = filledItems(v.items)
  return items.length ? { items, contact: v.contact.trim() || undefined } : null
}

/** Адресаты: groups (null — все активные) и как их показать в списке заявок. */
export function targetOf(v: FormValues, lists: GroupList[]): { groups: string[] | null; label: string | null } {
  if (v.target === 'pick') return { groups: v.groups, label: null }
  if (v.target === 'list') {
    const list = lists.find((l) => String(l.id) === v.listId)
    return { groups: list?.groups ?? [], label: list?.name ?? null }
  }
  return { groups: null, label: null }
}

export function toRequest(v: FormValues, lists: GroupList[]): CampaignForm {
  const target = targetOf(v, lists)
  const content =
    v.mode === 'text'
      ? { mode: 'text', text: v.text, items: null, contact: null }
      : { mode: 'fields', items: filledItems(v.items), text: null, contact: v.contact.trim() || null }
  const repeat =
    v.repeat === 'at'
      ? { mode: 'ONCE' as const, start: v.atTime, end: null, intervalMinutes: null }
      : v.repeat === 'daily'
        ? { mode: 'DAILY' as const, start: v.dailyTime, end: null, intervalMinutes: null }
        : v.repeat === 'interval'
          ? { mode: 'INTERVAL' as const, start: v.intervalStart, end: v.intervalEnd, intervalMinutes: v.intervalMinutes }
          : { mode: 'ONCE' as const, start: null, end: null, intervalMinutes: null }
  return {
    title: v.title.trim() || null,
    content,
    groups: target.groups,
    targetLabel: target.label,
    repeat,
    sendNow: v.repeat === 'now' ? true : v.repeat === 'at' ? false : v.sendNow,
  }
}

type StoredForm = { mode?: string; items?: Partial<Item>[] | null; text?: string | null; contact?: string | null }

/** Значения формы для правки существующей заявки. */
export function fromCampaign(c: Campaign, lists: GroupList[]): FormValues {
  const base = defaultValues()
  let stored: StoredForm | null = null
  try {
    stored = c.form ? (JSON.parse(c.form) as StoredForm) : null
  } catch {
    stored = null
  }
  const items = stored?.items?.length ? stored.items.map((it) => ({ ...emptyItem(), ...Object.fromEntries(Object.entries(it).map(([k, v]) => [k, v ?? ''])) })) : null
  const content =
    stored?.mode === 'fields' && items
      ? { mode: 'fields' as const, items, text: '', contact: stored.contact ?? '' }
      : { mode: 'text' as const, items: [emptyItem()], text: stored?.text || c.message, contact: '' }

  const targets = c.targets.map((t) => t.jid)
  const list = c.targeted
    ? lists.find((l) => l.name === c.targetLabel && l.groups.length === targets.length && targets.every((t) => l.groups.includes(t)))
    : undefined
  const target = !c.targeted ? { target: 'all' as const } : list ? { target: 'list' as const, listId: String(list.id) } : { target: 'pick' as const, groups: targets }

  const repeat =
    c.repeatMode === 'DAILY'
      ? { repeat: 'daily' as const, dailyTime: c.startTime ?? base.dailyTime }
      : c.repeatMode === 'INTERVAL'
        ? { repeat: 'interval' as const, intervalStart: c.startTime ?? base.intervalStart, intervalEnd: c.endTime ?? base.intervalEnd, intervalMinutes: c.intervalMinutes ?? 120 }
        : c.startTime
          ? { repeat: 'at' as const, atTime: c.startTime }
          : { repeat: 'now' as const }

  // Название, совпадающее с маршрутом, — автоматическое: при смене маршрута сменится и оно.
  const auto = content.mode === 'fields' && c.title === content.items[0]?.route.trim()
  return { ...base, ...content, title: auto ? '' : c.title, ...target, ...repeat, sendNow: false }
}
