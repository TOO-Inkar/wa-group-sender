import { expect, test, type Browser, type Page } from '@playwright/test'
import { CAMPAIGN_ID, FIRST_PAGE as PAGE, PASSWORD, campaign } from './support/campaign-card'

const TOTAL = 2000
const LAST = `Большая группа ${TOTAL}`

const groups = Array.from({ length: TOTAL }, (_, i) => ({
  jid: `${120363500000000 + i}@g.us`,
  name: `Большая группа ${i + 1}`,
  archived: true,
  member: true,
  canSend: true,
  active: true,
  lastSync: '2026-11-03T23:32:04Z',
  participants: 40,
  community: false,
  tooLarge: false,
  rejectedCount: 0,
  rejected: false,
  blockedBy: null,
}))

const deliveries = groups.map((g, i) => ({ groupJid: g.jid, groupName: g.name, position: i, status: 'SENT', error: null, sentAt: new Date(Date.UTC(2026, 9, 29, 9, 0) + i * 4_500).toISOString() }))

async function open(browser: Browser, width: number, path: string): Promise<Page> {
  const phone = width < 768
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  await page.route('**/api/groups?*', (route) => route.fulfill({ json: groups }))
  await page.route('**/api/groups', (route) => route.fulfill({ json: groups }))
  await page.route(`**/api/admin/campaigns/${CAMPAIGN_ID}`, (route) => route.fulfill({ json: campaign('done') }))
  await page.route('**/api/admin/requests/*/deliveries', (route) => route.fulfill({ json: deliveries }))
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  await page.goto(path)
  return page
}

async function expectPagedChecklist(page: Page, scope: ReturnType<Page['locator']>) {
  const rows = scope.getByRole('checkbox', { name: /^Большая группа / })
  await expect(rows).toHaveCount(PAGE)
  await scope.getByRole('button', { name: `Показать ещё ${PAGE} из ${TOTAL - PAGE}` }).click()
  await expect(rows).toHaveCount(2 * PAGE)

  await scope.getByPlaceholder('Поиск по названию группы').fill(String(TOTAL))
  await expect(rows).toHaveCount(1)
  await expect(scope.getByRole('checkbox', { name: LAST, exact: true })).toBeVisible()
  await scope.getByPlaceholder('Поиск по названию группы').fill('')

  await scope.getByText('Выбрать все').click()
  await expect(scope.getByText(`Выбрано: ${TOTAL} из ${TOTAL}`)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

for (const width of [360, 1440]) {
  test(`страница групп с ${TOTAL} группами показывает их частями, поиск и «Выбрать все» идут по всем · ${width}`, async ({ browser }) => {
    const page = await open(browser, width, '/groups')
    await expectPagedChecklist(page, page.locator('main'))
    await page.screenshot({ path: `e2e-results/large-lists/groups-${width}.png` })
    await page.context().close()
  })

  test(`выбор групп в заявке с ${TOTAL} группами · ${width}`, async ({ browser }) => {
    const page = await open(browser, width, '/campaigns/new')
    await page.getByRole('radio', { name: 'Выбрать' }).click()
    const dialog = page.getByRole('dialog', { name: 'Выберите группы' })
    await expectPagedChecklist(page, dialog)
    await expect(dialog.getByText(`Выбрано: ${TOTAL}`, { exact: true })).toBeVisible()
    await page.context().close()
  })

  test(`результаты запуска на ${TOTAL} групп показываются частями · ${width}`, async ({ browser }) => {
    const page = await open(browser, width, `/campaigns/${CAMPAIGN_ID}`)
    const list = page.getByRole('list', { name: 'Группы рассылки' })
    await expect(list.getByRole('listitem')).toHaveCount(PAGE)
    await page.getByRole('button', { name: `Показать ещё ${PAGE} из ${TOTAL - PAGE}` }).click()
    await expect(list.getByRole('listitem')).toHaveCount(2 * PAGE)
    await page.getByPlaceholder('Найти группу').fill(String(TOTAL))
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText(LAST)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `e2e-results/large-lists/run-${width}.png` })
    await page.context().close()
  })
}
