import { describe, expect, it } from 'vitest'
import { defaultValues, formSchema, fromCampaign, toRequest, type FormValues } from './form'
import type { Campaign, GroupList } from '@/shared/api/types'

const lists: GroupList[] = [{ id: 7, name: 'Тест', groups: ['1@g.us', '2@g.us'] }]

const filled = (over: Partial<FormValues> = {}): FormValues => ({
  ...defaultValues(),
  items: [{ route: 'ХОРГОС → БАКУ', date: 'Срочно', vehicles: 'Тент 20 т', cargo: 'Мука', conditions: '', freight: '🔥' }],
  ...over,
})

describe('форма заявки → запрос API', () => {
  it('сейчас, все группы', () => {
    const body = toRequest(filled({ contact: ' Ернар ' }), lists)
    expect(body.groups).toBeNull()
    expect(body.repeat).toEqual({ mode: 'ONCE', start: null, end: null, intervalMinutes: null })
    expect(body.sendNow).toBe(true)
    expect(body.content).toMatchObject({ mode: 'fields', contact: 'Ернар' })
    expect(body.content?.items?.[0]?.conditions).toBeNull()
  })

  it('список групп уходит с его названием, повтор — с интервалом', () => {
    const body = toRequest(filled({ target: 'list', listId: '7', repeat: 'interval', intervalMinutes: 60, intervalStart: '05:00', intervalEnd: '23:00', sendNow: false }), lists)
    expect(body.groups).toEqual(['1@g.us', '2@g.us'])
    expect(body.targetLabel).toBe('Тест')
    expect(body.repeat).toEqual({ mode: 'INTERVAL', start: '05:00', end: '23:00', intervalMinutes: 60 })
    expect(body.sendNow).toBe(false)
  })
})

describe('проверка формы', () => {
  it('обязательные поля заявки', () => {
    const result = formSchema.safeParse(filled({ items: [{ route: 'А → Б', date: '', vehicles: '', cargo: '', conditions: '', freight: '' }] }))
    expect(result.success).toBe(false)
    const paths = result.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['items.0.date', 'items.0.vehicles', 'items.0.cargo', 'items.0.freight']))
    expect(paths).not.toContain('items.0.conditions')
  })

  it('выбранные группы и время повтора', () => {
    expect(formSchema.safeParse(filled({ target: 'pick', groups: [] })).success).toBe(false)
    expect(formSchema.safeParse(filled({ repeat: 'interval', intervalStart: '10:00', intervalEnd: '09:00' })).success).toBe(false)
    expect(formSchema.safeParse(filled()).success).toBe(true)
  })
})

describe('правка заявки', () => {
  const campaign = {
    id: '3',
    title: 'ХОРГОС → БАКУ',
    message: '📍*ХОРГОС → БАКУ*',
    form: JSON.stringify({ mode: 'fields', items: [{ route: 'ХОРГОС → БАКУ', date: 'Срочно', vehicles: 'Тент', cargo: 'Мука', freight: '🔥', conditions: null }], contact: 'Ернар' }),
    targeted: true,
    targetLabel: 'Тест',
    targets: [
      { jid: '2@g.us', name: 'Б' },
      { jid: '1@g.us', name: 'А' },
    ],
    repeatMode: 'DAILY',
    startTime: '05:00',
    endTime: null,
    intervalMinutes: null,
  } as unknown as Campaign

  it('восстанавливает поля, список и расписание; название по маршруту остаётся автоматическим', () => {
    const v = fromCampaign(campaign, lists)
    expect(v.mode).toBe('fields')
    expect(v.items[0]?.conditions).toBe('')
    expect(v.contact).toBe('Ернар')
    expect(v.target).toBe('list')
    expect(v.listId).toBe('7')
    expect(v.repeat).toBe('daily')
    expect(v.dailyTime).toBe('05:00')
    expect(v.title).toBe('')
    expect(v.sendNow).toBe(false)
  })

  it('старая заявка без полей правится как готовый текст', () => {
    const v = fromCampaign({ ...campaign, form: null, targeted: false, repeatMode: 'ONCE', startTime: null } as Campaign, lists)
    expect(v.mode).toBe('text')
    expect(v.text).toBe('📍*ХОРГОС → БАКУ*')
    expect(v.target).toBe('all')
    expect(v.repeat).toBe('now')
  })
})
