import { expect, type Browser, type Page } from '@playwright/test'
import { login, newPage } from './session'

export { PASSWORD } from './session'
export const CAMPAIGN_ID = '777'
export const TARGETS = 255
export const DELIVERIES = 259
export const FIRST_PAGE = 25

const NAMES = [
  '🚛 Грузоперевозки Казахстан Россия Узбекистан Кыргызстан Китай 24/7',
  '🌐💤🌐Azərbaycan yük qrupu🇦🇿🇹🇷🇷🇺🇧🇾🌐💤🌐',
  'Логистика СНГ | Фуры | Тенты | Рефы | Попутные грузы',
  'ГРУЗЫ КНР',
  'Дальнобойщики',
]

export const MESSAGE = [
  '🇨🇳 КИТАЙ → 🇰🇿 КАЗАХСТАН / 🇩🇪 ГЕРМАНИЯ',
  '',
  ...Array.from({ length: 28 }, (_, i) => `${i + 1}. Доставка интернет-товаров, сборные грузы из Гуанчжоу, Иу, Урумчи — от 3 дней, страховка и растаможка включены ${'🔥'.repeat(i % 4)}`),
  '',
  '📞 +7 700 000 00 00 · Telegram @cargo_demo · WhatsApp — пишите в любое время',
].join('\n')

const name = (i: number) => `${NAMES[i % NAMES.length]} ${i + 1}`

export type CardState = 'sending' | 'scheduled' | 'done' | 'disabled' | 'failed' | 'never'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 14, 1) - minutes * 60_000).toISOString()

export const sentAt = (position: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) + position * 6_000).toISOString()

function deliveries(state: CardState) {
  return Array.from({ length: DELIVERIES }, (_, i) => {
    const status = state === 'sending' && i > 120 ? 'PENDING' : i === 7 ? 'FAILED' : i % 60 === 3 ? 'SKIPPED' : 'SENT'
    return { groupJid: `${120363800000000 + i}@g.us`, groupName: name(i), position: i, status, error: status === 'FAILED' ? 'not-participant' : status === 'SKIPPED' ? 'community' : null, sentAt: status === 'SENT' ? sentAt(i) : null }
  })
}

function run(id: string, state: CardState, minutes: number) {
  const list = deliveries(state)
  const count = (s: string) => list.filter((d) => d.status === s).length
  return {
    id,
    status: state === 'sending' ? 'SENDING' : state === 'failed' ? 'FAILED' : 'DONE',
    error: state === 'failed' ? 'номер отключился' : null,
    queuedAt: at(minutes),
    startedAt: at(minutes),
    completedAt: state === 'sending' ? null : at(minutes - 20),
    progress: { total: list.length, sent: count('SENT'), failed: count('FAILED'), skipped: count('SKIPPED'), pending: count('PENDING') },
    waiting: null,
  }
}

export function campaign(state: CardState) {
  const runs = state === 'never' ? [] : [run('R2', state, 0), run('R1', 'done', 24 * 60)]
  return {
    id: CAMPAIGN_ID,
    title: '🇨🇳 Китай → Казахстан, Германия: интернет-товары и сборные грузы',
    message: MESSAGE,
    form: null,
    targeted: true,
    targetLabel: 'Универсальные группы',
    targets: Array.from({ length: TARGETS }, (_, i) => ({ jid: `${120363800000000 + i}@g.us`, name: name(i) })),
    repeatMode: state === 'scheduled' || state === 'disabled' ? 'INTERVAL' : 'ONCE',
    startTime: state === 'scheduled' || state === 'disabled' ? '08:00' : null,
    endTime: state === 'scheduled' || state === 'disabled' ? '23:00' : null,
    intervalMinutes: state === 'scheduled' || state === 'disabled' ? 60 : null,
    extraTimes: [],
    anyTime: false,
    enabled: state === 'scheduled' || state === 'sending',
    createdAt: at(3 * 24 * 60),
    updatedAt: at(60),
    nextRunAt: state === 'scheduled' ? at(-60) : null,
    lastRunAt: runs[0]?.queuedAt ?? null,
    current: state === 'sending' ? runs[0] : null,
    runCount: runs.length,
    runs,
  }
}

export async function mockCard(page: Page, state: CardState = 'done') {
  await page.route(`**/api/admin/campaigns/${CAMPAIGN_ID}`, (route) => route.fulfill({ json: campaign(state) }))
  await page.route('**/api/admin/requests/*/deliveries', (route) => route.fulfill({ json: deliveries(state) }))
}

export async function openCard(browser: Browser, width: number, state: CardState = 'done', height = 900): Promise<Page> {
  const page = await newPage(browser, width, { height })
  await mockCard(page, state)
  await login(page)
  await page.goto(`/campaigns/${CAMPAIGN_ID}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  return page
}
