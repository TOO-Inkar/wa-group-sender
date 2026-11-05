import { expect, test, type Locator, type Page } from '@playwright/test'
import { openCard, type CardState } from './support/campaign-card'
import { CENTER_TOLERANCE_PX, EDGE_TOLERANCE_PX } from './support/layout'
import { mockLayoutData } from './support/layout-data'
import { login, newPage } from './support/session'

const WIDTHS = [360, 390, 768, 1024, 1440]
const TWO_COLUMNS = 1024
const NARROW_PANEL = 480
const SHOTS = 'e2e-results/fixes/after'
const LEFT = ['Рассылка', 'Уведомления в Telegram']
const RIGHT = ['Автоответчик', 'Сменить пароль']
const STACKED = ['Рассылка', 'Автоответчик', 'Уведомления в Telegram', 'Сменить пароль']

type Box = { x: number; y: number; width: number; height: number }

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

const round = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) })
const bottom = (b: Box) => b.y + b.height
const right = (b: Box) => b.x + b.width
const centerY = (b: Box) => b.y + b.height / 2
const sameRow = (a: Box, b: Box) => a.y < bottom(b) && b.y < bottom(a)
const intersects = (a: Box, b: Box) =>
  a.x < right(b) - EDGE_TOLERANCE_PX && b.x < right(a) - EDGE_TOLERANCE_PX && a.y < bottom(b) - EDGE_TOLERANCE_PX && b.y < bottom(a) - EDGE_TOLERANCE_PX

function expectApart(named: Record<string, Box>) {
  const entries = Object.entries(named)
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++)
      expect(intersects(entries[i]![1], entries[j]![1]), `${entries[i]![0]} × ${entries[j]![0]}`).toBe(false)
}

function expectInside(name: string, inner: Box, outer: Box) {
  expect(inner.x, `${name} слева`).toBeGreaterThanOrEqual(outer.x - EDGE_TOLERANCE_PX)
  expect(right(inner), `${name} справа`).toBeLessThanOrEqual(right(outer) + EDGE_TOLERANCE_PX)
  expect(inner.y, `${name} сверху`).toBeGreaterThanOrEqual(outer.y - EDGE_TOLERANCE_PX)
  expect(bottom(inner), `${name} снизу`).toBeLessThanOrEqual(bottom(outer) + EDGE_TOLERANCE_PX)
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

const card = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::*[@data-card][1]')

async function stackGap(locator: Locator) {
  return locator.evaluate((el) => {
    let parent = el.parentElement!
    while (getComputedStyle(parent).display === 'contents') parent = parent.parentElement!
    return parseFloat(getComputedStyle(parent).rowGap)
  })
}

function expectStacked(titles: string[], boxes: Record<string, Box>, gap: number) {
  for (let i = 1; i < titles.length; i++) {
    const above = boxes[titles[i - 1]!]!
    const below = boxes[titles[i]!]!
    expect(Math.abs(below.x - above.x), `${titles[i]} в той же колонке, что ${titles[i - 1]}`).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(Math.abs(below.y - bottom(above) - gap), `${titles[i]} сразу под ${titles[i - 1]}: зазор ${(below.y - bottom(above)).toFixed(1)}px, gap ${gap}px`).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
  }
}

async function runPanel(page: Page) {
  const run = page.getByRole('dialog').getByRole('group', { name: 'Запуск' })
  const select = run.getByRole('combobox', { name: 'Рассылка' })
  await run.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  return {
    run,
    select,
    field: select.locator('xpath=..'),
    badge: run.locator('span.rounded-full'),
    chevron: select.locator('xpath=..').locator('svg'),
    excel: run.getByRole('button', { name: 'Excel' }),
    pdf: run.getByRole('button', { name: 'PDF' }),
    retry: run.getByRole('button', { name: 'Повторить ошибки' }),
  }
}

async function measureRunPanel(page: Page) {
  const p = await runPanel(page)
  const styles = await p.run.evaluate((el) => {
    const rows = Array.from(el.querySelectorAll<HTMLElement>('*')).filter((n) => ['flex', 'grid'].includes(getComputedStyle(n).display))
    return rows.slice(0, 3).map((n) => ({ display: getComputedStyle(n).display, wrap: getComputedStyle(n).flexWrap, columns: getComputedStyle(n).gridTemplateColumns, width: Math.round(n.getBoundingClientRect().width) }))
  })
  const boxes: Record<string, ReturnType<typeof round>> = {}
  for (const [name, l] of Object.entries(p)) if (name !== 'select' && (await l.count())) boxes[name] = round(await box(l))
  boxes.select = round(await box(p.select))
  return { boxes, styles }
}

async function expectAlignedPanel(page: Page) {
  const p = await runPanel(page)
  const run = await box(p.run)
  const field = await box(p.field)
  const select = await box(p.select)
  const badge = await box(p.badge)
  const chevron = await box(p.chevron)
  const excel = await box(p.excel)
  const pdf = await box(p.pdf)
  const retry = (await p.retry.count()) ? await box(p.retry) : null

  expectApart({ select, badge, chevron, excel, pdf, ...(retry ? { retry } : {}) })
  expectInside('бейдж в поле выбора', badge, field)
  expectInside('шеврон в поле выбора', chevron, field)
  expect(chevron.x, 'шеврон правее бейджа').toBeGreaterThan(right(badge))
  expect(Math.abs(centerY(badge) - centerY(field)), 'центр бейджа = центр поля').toBeLessThanOrEqual(CENTER_TOLERANCE_PX)
  for (const [name, b] of Object.entries({ field, excel, pdf, ...(retry ? { retry } : {}) })) {
    expectInside(name, b, run)
    expect(Math.abs(b.height - field.height), `${name}: высота ${b.height}px = поле ${field.height}px`).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
  }
  expect(Math.abs(centerY(excel) - centerY(pdf)), 'Excel и PDF на одной линии').toBeLessThanOrEqual(CENTER_TOLERANCE_PX)
  if (retry && sameRow(retry, excel)) expect(Math.abs(centerY(retry) - centerY(excel))).toBeLessThanOrEqual(CENTER_TOLERANCE_PX)

  if (run.width < NARROW_PANEL) {
    expect(excel.y, 'на узкой панели кнопки отдельной строкой').toBeGreaterThanOrEqual(bottom(field) - EDGE_TOLERANCE_PX)
    expect(Math.abs(excel.width - pdf.width), 'Excel и PDF равной ширины').toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(Math.abs(excel.x - run.x), 'Excel от левого края').toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(Math.abs(right(pdf) - right(run)), 'PDF до правого края').toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
  } else if (!retry) {
    expect(sameRow(excel, field), 'на широкой панели кнопки в строке с выбором').toBe(true)
    expect(Math.abs(centerY(excel) - centerY(field)), 'центры кнопок и поля').toBeLessThanOrEqual(CENTER_TOLERANCE_PX)
    expect(excel.x).toBeGreaterThan(right(field))
  }
  if (sameRow(excel, field)) expect(Math.abs(centerY(excel) - centerY(field))).toBeLessThanOrEqual(CENTER_TOLERANCE_PX)
  await expectNoHorizontalScroll(page)
}

for (const width of WIDTHS) {
  test(`настройки: колонки не зависят по высоте · ${width}`, async ({ browser }) => {
    const page = await newPage(browser, width)
    await mockLayoutData(page)
    await login(page)
    await page.goto('/settings')
    await expect(page.getByText('получает', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible()

    const boxes: Record<string, Box> = {}
    for (const title of STACKED) boxes[title] = await box(card(page, title))
    const grid = await card(page, 'Рассылка').evaluate((el) => {
      let parent = el.parentElement!
      while (getComputedStyle(parent).display === 'contents') parent = parent.parentElement!
      const s = getComputedStyle(parent)
      return { display: s.display, rows: s.gridTemplateRows, columns: s.gridTemplateColumns, gap: s.rowGap, align: s.alignItems }
    })
    console.log(`settings ${width}: ${JSON.stringify(grid)} ${JSON.stringify(Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, round(b)])))}`)
    await page.screenshot({ path: `${SHOTS}/settings-${width}.png`, fullPage: true })

    expectApart(boxes)
    await expectNoHorizontalScroll(page)
    const gap = await stackGap(card(page, 'Рассылка'))
    if (width >= TWO_COLUMNS) {
      expectStacked(LEFT, boxes, gap)
      expectStacked(RIGHT, boxes, await stackGap(card(page, 'Автоответчик')))
      expect(boxes['Автоответчик']!.x).toBeGreaterThan(right(boxes['Рассылка']!))
      expect(Math.abs(boxes['Автоответчик']!.y - boxes['Рассылка']!.y)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    } else expectStacked(STACKED, boxes, gap)
    await page.context().close()
  })

  for (const state of ['done', 'sending'] as CardState[])
    test(`панель запуска «${state}» выровнена · ${width}`, async ({ browser }) => {
      const page = await openCard(browser, width, state)
      await expect(page.getByRole('dialog').getByRole('list', { name: 'Группы рассылки' }).getByRole('listitem').first()).toBeVisible()
      const measured = await measureRunPanel(page)
      console.log(`run ${state} ${width}: ${JSON.stringify(measured)}`)
      await page.screenshot({ path: `${SHOTS}/run-${state}-${width}.png` })
      await expectAlignedPanel(page)
      await page.context().close()
    })

  test(`отчёт для заказчика: кнопки экспорта выровнены · ${width}`, async ({ browser }) => {
    const page = await newPage(browser, width)
    await mockLayoutData(page)
    await login(page)
    await page.getByRole('button', { name: 'Отчёт' }).click()
    const dialog = page.getByRole('dialog', { name: 'Отчёт для заказчика' })
    await expect(dialog).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/report-${width}.png` })
    const frame = await box(dialog)
    const excel = await box(dialog.getByRole('button', { name: 'Excel' }))
    const pdf = await box(dialog.getByRole('button', { name: 'PDF' }))
    const date = await box(dialog.getByLabel('С', { exact: true }))
    console.log(`report ${width}: ${JSON.stringify({ frame: round(frame), excel: round(excel), pdf: round(pdf), date: round(date) })}`)
    expectApart({ excel, pdf, date })
    expectInside('Excel', excel, frame)
    expectInside('PDF', pdf, frame)
    expect(Math.abs(centerY(excel) - centerY(pdf))).toBeLessThanOrEqual(CENTER_TOLERANCE_PX)
    expect(Math.abs(excel.height - date.height), 'кнопки высотой с поле').toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(Math.abs(excel.width - pdf.width), 'Excel и PDF равной ширины').toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    await expectNoHorizontalScroll(page)
    await page.context().close()
  })
}
