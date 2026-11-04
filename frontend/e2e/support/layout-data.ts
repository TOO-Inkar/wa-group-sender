import type { Page, Route } from '@playwright/test'
import { campaign, mockCard, type CardState } from './campaign-card'

export const GROUPS = 140
export const SHORT_LIST = { id: 1, name: 'Тралы, площадки', size: 9 }
export const LONG_LIST = { id: 2, name: 'Грузоперевозки Казахстан Россия Узбекистан Кыргызстан', size: 120 }
export const LIST_STATES: CardState[] = ['sending', 'scheduled', 'done', 'disabled', 'failed']

const GROUP_NAMES = [
  '🚛 Грузоперевозки Казахстан Россия Узбекистан Кыргызстан Китай 24/7',
  '🌐💤🌐Azərbaycan yük qrupu🇦🇿🇹🇷🇷🇺🇧🇾🌐💤🌐',
  'Логистика СНГ | Фуры | Тенты | Рефы | Попутные грузы',
  'ГРУЗЫ КНР',
]
const FIRST_JID = 120363900000000
const jid = (i: number) => `${FIRST_JID + i}@g.us`
const HOUR = 3_600_000
const requested = (hours: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - hours * HOUR).toISOString()

export const TELEGRAM = {
  botConfigured: true,
  botUsername: 'wa_group_sender_notifications_bot',
  inviteLink: 'https://t.me/wa_group_sender_notifications_bot?start=c7f3a91e5b2d48a6b0e4f19c2d7a63e8',
  configuredChats: [
    {
      chatId: '-1001987654321',
      name: 'Диспетчерская логистики Алматы — уведомления',
      username: 'almaty_logistics_dispatch_notifications',
    },
  ],
  subscribers: [
    {
      chatId: '511',
      name: 'Нурсултан Абдрахманов-Каирбеков',
      username: 'nursultan_abdrakhmanov_kairbekov',
      status: 'APPROVED',
      requestedAt: requested(30),
      decidedAt: requested(29),
    },
    {
      chatId: '512',
      name: 'Айгерим',
      username: 'aigerim_cargo_kz',
      status: 'PENDING',
      requestedAt: requested(2),
      decidedAt: null,
    },
    {
      chatId: '513',
      name: null,
      username: null,
      status: 'REJECTED',
      requestedAt: requested(50),
      decidedAt: requested(49),
    },
  ],
}

const isGet = (route: Route) => route.request().method() === 'GET'

export async function mockLayoutData(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/groups',
    async (route) => {
      if (!isGet(route)) return route.fallback()
      const response = await route.fetch()
      const real = (await response.json()) as Record<string, unknown>[]
      const groups = Array.from({ length: GROUPS }, (_, i) => ({
        ...real[0],
        jid: jid(i),
        name: `${GROUP_NAMES[i % GROUP_NAMES.length]} ${i + 1}`,
        active: i % 7 !== 3,
        archived: false,
        member: true,
        canSend: true,
        community: false,
        rejected: i % 7 === 3,
        rejectedCount: i % 7 === 3 ? 2 : 0,
        blockedBy: null,
        participants: 200 + i,
      }))
      await route.fulfill({ response, json: groups })
    },
  )
  await page.route(
    (url) => url.pathname === '/api/admin/group-lists',
    (route) =>
      isGet(route)
        ? route.fulfill({
            json: [SHORT_LIST, LONG_LIST].map((l) => ({
              id: l.id,
              name: l.name,
              groups: Array.from({ length: l.size }, (_, i) => jid(i)),
            })),
          })
        : route.fallback(),
  )
  await page.route(
    (url) => url.pathname === '/api/admin/campaigns',
    (route) =>
      isGet(route)
        ? route.fulfill({ json: LIST_STATES.map((state, i) => ({ ...campaign(state), id: String(777 + i) })) })
        : route.fallback(),
  )
  await page.route(
    (url) => url.pathname === '/api/admin/telegram',
    (route) => (isGet(route) ? route.fulfill({ json: TELEGRAM }) : route.fallback()),
  )
  await mockCard(page)
}
