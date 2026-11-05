import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { BULK_PREFIX, mockBulkGroups } from './support/bulk-groups'
import { CAMPAIGN_ID, DELIVERIES, mockCard, TARGETS } from './support/campaign-card'
import { controlHeightOk, controlHeightRule, pointerIsCoarse } from './support/layout'
import { login, newPage } from './support/session'

const WIDTHS = [360, 390, 768, 1024, 1440]
const GROUPS = 1000
const GROUPS_PAGE = 25
const RECIPIENTS_PAGE = 10
const LARGE_PAGE = 100
const ROW_MARGIN = 2
const QUERY = `${BULK_PREFIX} 1`
const QUERY_HITS = 112
const FAILED = 1
const KNR = { query: 'ГРУЗЫ КНР', hits: 52 }

test.describe.configure({ mode: 'parallel' })

const pages = (total: number, size: number) => Math.ceil(total / size)
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

function pager(scope: Locator, label: string) {
  const nav = scope.getByRole('navigation', { name: label })
  return {
    nav,
    status: nav.getByText(/^Страница \d+ из \d+$/),
    counter: nav.getByText(/^\d+–\d+ из \d+$/),
    size: nav.getByRole('combobox', { name: 'На странице' }),
    first: nav.getByRole('button', { name: 'Первая страница' }),
    prev: nav.getByRole('button', { name: 'Предыдущая страница' }),
    next: nav.getByRole('button', { name: 'Следующая страница' }),
    last: nav.getByRole('button', { name: 'Последняя страница' }),
  }
}

type Pager = ReturnType<typeof pager>

async function goLast(p: Pager) {
  if (await p.last.isVisible()) return p.last.click()
  while (await p.next.isEnabled()) await p.next.click()
}

async function expectTouchTargets(page: Page, p: Pager) {
  const coarse = await pointerIsCoarse(page)
  for (const control of [p.size, p.prev, p.next]) {
    const box = await control.boundingBox()
    expect(box, 'контрол пейджера не отрисован').not.toBeNull()
    expect(controlHeightOk(box!.height, coarse), `${await control.getAttribute('aria-label')}: ${box!.height}px, ${controlHeightRule(coarse)}`).toBe(true)
    if (coarse) expect(box!.width).toBeGreaterThanOrEqual(box!.height - 1)
  }
  await expect(p.nav.locator('[aria-current="page"]')).toHaveCount(1)
}

async function open(browser: Browser, width: number) {
  const page = await newPage(browser, width)
  await mockBulkGroups(page, GROUPS)
  await mockCard(page, 'done')
  await login(page)
  return page
}

for (const width of WIDTHS) {
  test(`группы: 1000 групп листаются страницами · ${width}`, async ({ browser }) => {
    const page = await open(browser, width)
    await page.goto('/groups')
    const main = page.locator('main')
    const rows = main.getByRole('checkbox', { name: new RegExp(`^${BULK_PREFIX} `) })
    const p = pager(main, 'Страницы групп')

    await expect(rows).toHaveCount(GROUPS_PAGE)
    expect(await main.locator('label').count()).toBeLessThanOrEqual(GROUPS_PAGE + ROW_MARGIN)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(GROUPS, GROUPS_PAGE)}`)
    await expect(p.counter).toHaveText(`1–${GROUPS_PAGE} из ${GROUPS}`)
    await expect(p.prev).toBeDisabled()
    await expect(p.next).toBeEnabled()
    await expect(p.size).toHaveValue(String(GROUPS_PAGE))
    await expectTouchTargets(page, p)

    const firstOnPage1 = await rows.first().getAttribute('aria-label')
    await p.next.click()
    await expect(p.status).toHaveText(`Страница 2 из ${pages(GROUPS, GROUPS_PAGE)}`)
    await expect(rows.first()).not.toHaveAttribute('aria-label', firstOnPage1!)
    await expect(rows.first()).toHaveAttribute('aria-label', `${BULK_PREFIX} ${GROUPS_PAGE + 1}`)
    await expect(p.prev).toBeEnabled()

    await p.size.selectOption(String(LARGE_PAGE))
    await expect(p.status).toHaveText(`Страница 1 из ${pages(GROUPS, LARGE_PAGE)}`)
    await expect(rows).toHaveCount(LARGE_PAGE)

    await goLast(p)
    await expect(p.status).toHaveText(`Страница ${pages(GROUPS, LARGE_PAGE)} из ${pages(GROUPS, LARGE_PAGE)}`)
    await expect(p.next).toBeDisabled()
    await expect(p.prev).toBeEnabled()
    await expect(p.counter).toHaveText(`${GROUPS - LARGE_PAGE + 1}–${GROUPS} из ${GROUPS}`)

    await main.getByPlaceholder('Поиск по названию группы').fill(QUERY)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(QUERY_HITS, LARGE_PAGE)}`)
    await expect(p.counter).toHaveText(`1–${LARGE_PAGE} из ${QUERY_HITS}`)
    await expect(p.prev).toBeDisabled()
    expect(await overflow(page)).toBeLessThanOrEqual(0)

    await page.reload()
    await expect(p.size).toHaveValue(String(LARGE_PAGE))
    await expect(rows).toHaveCount(LARGE_PAGE)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(GROUPS, LARGE_PAGE)}`)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.context().close()
  })

  test(`выбор групп: «Выбрать все» по поиску отмечает все страницы · ${width}`, async ({ browser }) => {
    const page = await open(browser, width)
    await page.goto('/campaigns/new')
    await page.getByRole('radio', { name: 'Выбрать' }).click()
    const dialog = page.getByRole('dialog', { name: 'Выберите группы' })
    const rows = dialog.getByRole('checkbox', { name: new RegExp(`^${BULK_PREFIX} `) })
    const p = pager(dialog, 'Страницы групп')

    await expect(rows).toHaveCount(GROUPS_PAGE)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(GROUPS, GROUPS_PAGE)}`)
    await expectTouchTargets(page, p)

    await rows.first().check()
    await p.next.click()
    await expect(rows.first()).toHaveAttribute('aria-label', `${BULK_PREFIX} ${GROUPS_PAGE + 1}`)
    await rows.first().check()
    await p.prev.click()
    await expect(rows.first()).toBeChecked()
    await expect(dialog.getByText('Выбрано: 2', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Сбросить' }).click()

    await p.next.click()
    await dialog.getByPlaceholder('Поиск по названию группы').fill(QUERY)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(QUERY_HITS, GROUPS_PAGE)}`)
    await dialog.getByText('Выбрать все').click()
    await expect(dialog.getByText(`Выбрано: ${QUERY_HITS} из ${QUERY_HITS}`)).toBeVisible()
    await expect(dialog.getByText(`Выбрано: ${QUERY_HITS}`, { exact: true })).toBeVisible()
    await goLast(p)
    await expect(p.status).toHaveText(`Страница ${pages(QUERY_HITS, GROUPS_PAGE)} из ${pages(QUERY_HITS, GROUPS_PAGE)}`)
    for (const row of await rows.all()) await expect(row).toBeChecked()

    await dialog.getByPlaceholder('Поиск по названию группы').fill('')
    await expect(dialog.getByText(`Выбрано: ${QUERY_HITS} из ${GROUPS}`)).toBeVisible()
    await expect(p.status).toHaveText(`Страница 1 из ${pages(GROUPS, GROUPS_PAGE)}`)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    expect(await dialog.locator('[data-dialog-body]').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await page.context().close()
  })

  test(`состав списка: «Выбрать все» по поиску и выбор между страницами · ${width}`, async ({ browser }) => {
    const page = await open(browser, width)
    await page.goto('/groups')
    await page.getByRole('button', { name: 'Новый список' }).click()
    const main = page.locator('main')
    const rows = main.getByRole('checkbox', { name: new RegExp(`^${BULK_PREFIX} `) })
    const p = pager(main, 'Страницы групп')

    await expect(rows).toHaveCount(GROUPS_PAGE)
    await main.getByPlaceholder('Поиск по названию группы').fill(QUERY)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(QUERY_HITS, GROUPS_PAGE)}`)
    await main.getByText('Выбрать все').click()
    await expect(main.getByText(`Выбрано: ${QUERY_HITS} из ${QUERY_HITS}`)).toBeVisible()
    await expect(page.getByText(`В списке ${QUERY_HITS} групп`)).toBeVisible()
    await p.next.click()
    for (const row of await rows.all()) await expect(row).toBeChecked()
    await rows.first().uncheck()
    await p.prev.click()
    await p.next.click()
    await expect(rows.first()).not.toBeChecked()
    await expect(main.getByText(`Выбрано: ${QUERY_HITS - 1} из ${QUERY_HITS}`)).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.context().close()
  })

  test(`карточка заявки: «Кому» и результаты листаются страницами · ${width}`, async ({ browser }) => {
    const page = await open(browser, width)
    await page.goto(`/campaigns/${CAMPAIGN_ID}`)
    const sheet = page.getByRole('dialog')

    const recipients = sheet.getByRole('list', { name: 'Группы заявки' }).getByRole('listitem')
    const r = pager(sheet, 'Страницы получателей')
    await expect(recipients).toHaveCount(RECIPIENTS_PAGE)
    await expect(sheet.getByRole('button', { name: /Показать все/ })).toHaveCount(0)
    await expect(r.status).toHaveText(`Страница 1 из ${pages(TARGETS, RECIPIENTS_PAGE)}`)
    await expect(r.prev).toBeDisabled()
    const firstRecipient = await recipients.first().textContent()
    await r.next.click()
    await expect(recipients.first()).not.toHaveText(firstRecipient!)
    await goLast(r)
    await expect(r.next).toBeDisabled()
    await expect(recipients).toHaveCount(TARGETS % RECIPIENTS_PAGE || RECIPIENTS_PAGE)
    await expectTouchTargets(page, r)

    const list = sheet.getByRole('list', { name: 'Группы рассылки' })
    const results = list.getByRole('listitem')
    const p = pager(sheet, 'Страницы результатов')
    await expect(results).toHaveCount(GROUPS_PAGE)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(DELIVERIES, GROUPS_PAGE)}`)
    expect(await list.evaluate((el) => ({ overflow: getComputedStyle(el).overflowY, fits: el.scrollHeight <= el.clientHeight }))).toEqual({ overflow: 'visible', fits: true })
    expect(await sheet.locator('[data-dialog-body]').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await expectTouchTargets(page, p)

    const firstResult = await results.first().textContent()
    await p.next.click()
    await expect(p.status).toHaveText(`Страница 2 из ${pages(DELIVERIES, GROUPS_PAGE)}`)
    await expect(results.first()).not.toHaveText(firstResult!)

    const search = sheet.getByRole('searchbox', { name: 'Найти группу' })
    await search.fill(KNR.query)
    await expect(p.status).toHaveText(`Страница 1 из ${pages(KNR.hits, GROUPS_PAGE)}`)
    await expect(p.counter).toHaveText(`1–${GROUPS_PAGE} из ${KNR.hits}`)
    await search.fill('')

    await sheet.getByRole('group', { name: 'Итоги рассылки' }).getByRole('button', { name: /Ошибки/ }).click()
    await expect(results).toHaveCount(FAILED)
    await expect(p.nav).toHaveCount(0)
    await sheet.getByRole('group', { name: 'Итоги рассылки' }).getByRole('button', { name: /Всего/ }).click()
    await expect(results).toHaveCount(GROUPS_PAGE)

    await p.size.selectOption(String(LARGE_PAGE))
    await expect(p.status).toHaveText(`Страница 1 из ${pages(DELIVERIES, LARGE_PAGE)}`)
    await expect(results).toHaveCount(LARGE_PAGE)
    expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')
    const viewport = page.viewportSize()!
    expect((await list.boundingBox())!.height).toBeLessThanOrEqual(viewport.height * 0.6 + 1)
    await search.scrollIntoViewIfNeeded()
    const before = { search: await search.boundingBox(), pager: await p.nav.boundingBox() }
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect(await search.boundingBox()).toEqual(before.search)
    expect(await p.nav.boundingBox()).toEqual(before.pager)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    expect(await sheet.locator('[data-dialog-body]').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await page.context().close()
  })
}
