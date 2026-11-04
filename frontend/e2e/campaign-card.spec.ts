import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectControlHeight } from './support/controls'
import { DELIVERIES, FIRST_PAGE, MESSAGE, openCard, sentAt, TARGETS, type CardState } from './support/campaign-card'

const WIDTHS = [360, 390, 768, 1024, 1440]
const STATES: CardState[] = ['sending', 'scheduled', 'done', 'disabled', 'failed']
const COLLAPSED_RECIPIENTS = 5
const TOLERANCE = 0.5
const WIDE = 768

type Box = { x: number; y: number; width: number; height: number }

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width - TOLERANCE && b.x < a.x + a.width - TOLERANCE && a.y < b.y + b.height - TOLERANCE && b.y < a.y + a.height - TOLERANCE

function blocks(page: Page) {
  const sheet = page.getByRole('dialog')
  return {
    sheet,
    preview: sheet.getByRole('region', { name: 'Сообщение' }),
    run: sheet.getByRole('group', { name: 'Запуск' }),
    select: sheet.getByRole('combobox', { name: 'Рассылка' }),
    badge: sheet.getByRole('group', { name: 'Запуск' }).locator('span.rounded-full'),
    tiles: sheet.getByRole('group', { name: 'Итоги рассылки' }),
    search: sheet.getByRole('searchbox', { name: 'Найти группу' }),
    results: sheet.getByRole('list', { name: 'Группы рассылки' }),
    recipients: sheet.getByRole('definition').filter({ has: page.getByRole('list', { name: 'Группы заявки' }) }),
  }
}

async function expectNoOverlaps(page: Page) {
  const b = blocks(page)
  const named = { preview: b.preview, run: b.run, tiles: b.tiles, search: b.search, results: b.results, recipients: b.recipients }
  const boxes = await Promise.all(Object.entries(named).map(async ([name, l]) => [name, await box(l)] as const))
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i][1], boxes[j][1]), `${boxes[i][0]} × ${boxes[j][0]}`).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const body = b.sheet.locator('[data-dialog-body]')
  expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
}

async function expectPreviewReadable(page: Page) {
  const { preview } = blocks(page)
  const scroller = preview.locator('div').first()
  const { scrollHeight, clientHeight, overflowY } = await scroller.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY }))
  if (scrollHeight > clientHeight + 1) expect(overflowY).toBe('auto')
  await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await preview.scrollIntoViewIfNeeded()
  const p = await box(preview)
  for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]]) {
    const inside = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[aria-label="Сообщение"]'), { x: p.x + p.width * fx, y: p.y + p.height * fy })
    expect(inside, `точка ${fx},${fy} превью закрыта другим элементом`).toBe(true)
  }
  await expect(preview).toContainText(MESSAGE.split('\n').at(-1)!)
}

for (const width of WIDTHS) {
  test(`карточка заявки: блоки не налезают · ${width}`, async ({ browser }) => {
    const page = await openCard(browser, width)
    const b = blocks(page)
    await expect(b.results.getByRole('listitem')).toHaveCount(FIRST_PAGE)
    await expectNoOverlaps(page)
    await expectPreviewReadable(page)

    expect(intersects(await box(b.badge), await box(b.select))).toBe(false)
    const select = await box(b.select)
    const badge = await box(b.badge)
    const sameLine = Math.abs(select.y + select.height / 2 - (badge.y + badge.height / 2)) < select.height / 2
    expect(sameLine || badge.y >= select.y + select.height - TOLERANCE).toBe(true)
    if (width >= WIDE) expect(sameLine).toBe(true)

    for (const button of await page.getByRole('dialog').getByRole('button', { name: /Изменить|Отправить сейчас|Удалить|Excel|PDF|Повторить ошибки/ }).all())
      await expectControlHeight(page, (await box(button)).height, await button.innerText())

    const tiles = await b.tiles.getByRole('button').all()
    const heights = new Set(await Promise.all(tiles.map(async (t) => Math.round((await box(t)).height))))
    expect(heights.size).toBe(1)
    for (const t of tiles) expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)
    const columns = new Set(await Promise.all(tiles.map(async (t) => Math.round((await box(t)).x)))).size
    expect(columns).toBe(width >= 1024 ? 5 : width >= 640 ? 3 : 2)

    const search = await box(b.search)
    await expectControlHeight(page, search.height, 'поиск')
    const list = b.results
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    for (const row of (await list.getByRole('listitem').all()).slice(0, 12)) {
      expect((await box(row)).height).toBeGreaterThanOrEqual(48)
      expect(await row.locator('span.truncate').first().evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap')
    }
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const last = await box(list.getByRole('listitem').last())
    const frame = await box(list)
    expect(last.y).toBeGreaterThanOrEqual(frame.y - TOLERANCE)
    expect(last.y + last.height).toBeLessThanOrEqual(frame.y + frame.height + TOLERANCE)
    expect(await box(b.search)).toEqual(search)

    const recipients = page.getByRole('dialog').getByRole('list', { name: 'Группы заявки' })
    await expect(b.recipients).toContainText(`Универсальные группы · ${TARGETS}`)
    await expect(recipients.getByRole('listitem')).toHaveCount(COLLAPSED_RECIPIENTS)
    const lastRecipient = await box(recipients.getByRole('listitem').last())
    const recipientsBox = await box(recipients)
    expect(lastRecipient.y + lastRecipient.height).toBeLessThanOrEqual(recipientsBox.y + recipientsBox.height + TOLERANCE)
    expect(await recipients.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)

    await b.preview.locator('div').first().evaluate((el) => el.scrollTo(0, 0))
    await list.evaluate((el) => el.scrollTo(0, 0))
    await b.sheet.locator('[data-dialog-body]').evaluate((el) => el.scrollTo(0, 0))
    await page.screenshot({ path: `e2e-results/card/after-${width}.png` })
    await b.run.scrollIntoViewIfNeeded()
    await b.run.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `e2e-results/card/after-${width}-results.png` })
    await b.sheet.getByRole('button', { name: `Показать все ${TARGETS}` }).click()
    await expect(recipients.getByRole('listitem')).toHaveCount(TARGETS)
    await expectNoOverlaps(page)
    await b.sheet.getByRole('button', { name: 'Свернуть' }).click()
    await expect(recipients.getByRole('listitem')).toHaveCount(COLLAPSED_RECIPIENTS)

    if (width < 1024) {
      const order = await Promise.all([b.preview, b.recipients, b.run].map(async (l) => (await box(l)).y))
      expect(order).toEqual([...order].sort((x, y) => x - y))
    } else {
      expect((await box(b.preview)).x).toBeLessThan((await box(b.run)).x)
    }
    await page.context().close()
  })
}

for (const state of STATES) {
  for (const width of [390, 1440]) {
    test(`карточка «${state}» выглядит одинаково · ${width}`, async ({ browser }) => {
      const page = await openCard(browser, width, state)
      await expect(blocks(page).results.getByRole('listitem')).toHaveCount(FIRST_PAGE)
      await expectNoOverlaps(page)
      await page.screenshot({ path: `e2e-results/card/state-${state}-${width}.png` })
      await page.context().close()
    })
  }
}

test('карточка без запусков показывает пустое состояние', async ({ browser }) => {
  for (const width of [390, 1440]) {
    const page = await openCard(browser, width, 'never')
    const results = page.getByRole('dialog').getByRole('region', { name: 'Результаты рассылки' })
    await expect(results).toContainText('Рассылок ещё не было.')
    expect(intersects(await box(results), await box(blocks(page).preview))).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.context().close()
  }
})

test('у каждой отправленной группы видно время отправки', async ({ browser }) => {
  for (const width of [360, 1440]) {
    const page = await openCard(browser, width, 'sending')
    const rows = blocks(page).results.getByRole('listitem')
    await expect(rows).toHaveCount(FIRST_PAGE)
    await page.getByRole('button', { name: `Показать ещё ${FIRST_PAGE} из ${DELIVERIES - FIRST_PAGE}` }).click()
    await expect(rows).toHaveCount(2 * FIRST_PAGE)
    const first = rows.nth(0)
    await expect(first.locator('time')).toHaveText('отправлено 29.10, 14:00')
    await expect(first.locator('time')).toHaveAttribute('datetime', sentAt(0))
    await expect(rows.nth(10).locator('time')).toHaveText('отправлено 29.10, 14:01')
    await expect(rows.nth(7).locator('time')).toHaveCount(0)
    await expect(rows.nth(121).locator('time')).toHaveCount(0)
    const row = await box(first)
    const time = await box(first.locator('time'))
    expect(time.x + time.width).toBeLessThanOrEqual(row.x + row.width + TOLERANCE)
    expect(time.y + time.height).toBeLessThanOrEqual(row.y + row.height + TOLERANCE)
    await page.context().close()
  }
})
