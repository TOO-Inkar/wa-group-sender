import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-pass'
const WIDTHS = [360, 390, 768, 1024, 1440]
const GROUPS = 284
const NAMES = ['🚛 Грузоперевозки Казахстан Россия Узбекистан Кыргызстан Китай 24/7', '🌐💤🌐Azərbaycan yük qrupu🇦🇿🇹🇷🇷🇺🇧🇾🌐💤🌐', 'Логистика СНГ | Фуры | Тенты | Рефы | Попутные грузы', 'ГРУЗЫ КНР']
const MAX_MENU_HEIGHT = 300

test.describe.configure({ mode: 'parallel' })

async function open(browser: Browser, width: number, height = 800) {
  const phone = width < 768
  const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  await page.route('**/api/groups', async (route) => {
    const response = await route.fetch()
    const real = (await response.json()) as Record<string, unknown>[]
    const groups = Array.from({ length: GROUPS }, (_, i) => ({
      ...real[0],
      jid: real[i]?.jid ?? `${120363900000000 + i}@g.us`,
      name: `${NAMES[i % NAMES.length]} ${i + 1}`,
      active: true,
      archived: true,
      member: true,
      canSend: true,
      community: false,
      rejected: false,
      rejectedCount: 0,
      participants: 200 + i,
    }))
    await route.fulfill({ response, json: groups })
  })
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  return { context, page }
}

const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

async function expectDialogFits(page: Page, dialog: Locator) {
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
  const viewport = page.viewportSize()!
  const d = await box(dialog)
  expect(d.x).toBeGreaterThanOrEqual(0)
  expect(d.x + d.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(d.y + d.height).toBeLessThanOrEqual(viewport.height + 0.5)
  const body = dialog.locator('[data-dialog-body]')
  const { scrollHeight, clientHeight, overflowY } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY }))
  expect(overflowY).toBe('auto')
  if (scrollHeight > clientHeight + 1) {
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  }
}

for (const width of WIDTHS) {
  test(`выбор групп скроллится, шапка и футер на месте · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    await page.goto('/campaigns/new')
    await page.getByRole('radio', { name: 'Выбрать' }).click()
    const dialog = page.getByRole('dialog', { name: 'Выберите группы' })
    await expect(dialog.getByRole('checkbox', { name: new RegExp(` ${GROUPS}$`) })).toBeAttached()
    const body = dialog.locator('[data-dialog-body]')
    const search = dialog.getByRole('searchbox')
    const done = dialog.getByRole('button', { name: 'Готово' })
    const before = { search: await box(search), done: await box(done) }

    const { scrollHeight, clientHeight } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
    expect(scrollHeight).toBeGreaterThan(clientHeight)

    if (width >= 768) {
      const first = await box(body.locator('label').first())
      await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
      await page.mouse.wheel(0, 1500)
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    }

    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const last = body.locator('label').last()
    await expect(last).toBeInViewport()
    expect(await box(search)).toEqual(before.search)
    expect(await box(done)).toEqual(before.done)
    await expect(done).toBeInViewport()
    await expect(search).toBeInViewport()
    await expectDialogFits(page, dialog)

    await dialog.getByRole('checkbox', { name: 'Выбрать все' }).or(dialog.getByLabel('Выбрать все')).first().check()
    await expect(dialog).toContainText(`Выбрано: ${GROUPS} из ${GROUPS}`)
    await page.screenshot({ path: `e2e-results/ui/${width}-picker.png` })
    await context.close()
  })

  test(`список времени компактный и закрывается · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    await page.goto('/campaigns/new')
    const sheet = page.getByRole('dialog', { name: 'Новая заявка' })
    await sheet.getByRole('radio', { name: 'Один раз' }).click()
    const trigger = sheet.getByRole('button', { name: 'Время', exact: true })
    await trigger.scrollIntoViewIfNeeded()
    const s = await box(sheet)
    await trigger.click()
    const menu = page.getByRole('menu', { name: 'Время' })
    await expect(menu).toBeVisible()
    const m = await box(menu)
    const viewport = page.viewportSize()!
    expect(m.height).toBeLessThanOrEqual(MAX_MENU_HEIGHT)
    expect(m.y).toBeGreaterThanOrEqual(0)
    expect(m.y + m.height).toBeLessThanOrEqual(viewport.height)
    expect(m.x).toBeGreaterThanOrEqual(s.x)
    expect(m.x + m.width).toBeLessThanOrEqual(s.x + s.width)
    await expect(menu.getByRole('group', { name: 'Часы' }).getByRole('menuitemradio', { checked: true })).toBeInViewport()
    await expect(menu.getByRole('group', { name: 'Минуты' }).getByRole('menuitemradio', { checked: true })).toBeInViewport()
    await page.screenshot({ path: `e2e-results/ui/${width}-time.png` })

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(sheet).toBeVisible()

    await trigger.click()
    await expect(menu).toBeVisible()
    await page.mouse.click(s.x + 10, s.y + 10)
    await expect(menu).toBeHidden()
    await expect(sheet).toBeVisible()

    await trigger.click()
    await menu.getByRole('group', { name: 'Часы' }).getByRole('menuitemradio', { name: '14' }).click()
    await expect(menu).toBeVisible()
    await menu.getByRole('group', { name: 'Минуты' }).getByRole('menuitemradio', { name: '35' }).click()
    await expect(menu).toBeHidden()
    await expect(trigger).toHaveText('14:35')
    await context.close()
  })

  test(`табы на заявках и группах одинаковые · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    const style = async () => {
      const active = page.getByRole('radio', { name: /^Все \d/ })
      await expect(active).toHaveAttribute('aria-checked', 'true')
      return active.evaluate((el) => {
        const s = getComputedStyle(el)
        const group = getComputedStyle(el.parentElement!)
        return {
          height: el.getBoundingClientRect().height,
          radius: s.borderRadius,
          background: s.backgroundColor,
          color: s.color,
          weight: s.fontWeight,
          size: s.fontSize,
          shadow: s.boxShadow,
          groupRadius: group.borderRadius,
          groupBackground: group.backgroundColor,
          groupWidth: el.parentElement!.getBoundingClientRect().width,
        }
      })
    }
    const campaigns = await style()
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    await page.getByRole('navigation').getByRole('link', { name: 'Группы', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Группы' })).toBeVisible()
    const groups = await style()
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    expect(groups).toEqual(campaigns)
    expect(campaigns.height).toBeGreaterThanOrEqual(40)
    await page.screenshot({ path: `e2e-results/ui/${width}-groups.png` })
    await context.close()
  })

  test(`модалки не вылезают и скроллятся · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width, 560)
    const check = async (dialog: Locator) => {
      await expect(dialog).toBeVisible()
      await expectDialogFits(page, dialog)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }

    await page.getByRole('button', { name: 'Отчёт' }).click()
    await check(page.getByRole('dialog', { name: 'Отчёт для заказчика' }))

    await page.goto('/campaigns/new')
    const sheet = page.getByRole('dialog', { name: 'Новая заявка' })
    await expectDialogFits(page, sheet)
    await sheet.getByRole('radio', { name: 'Готовый текст' }).click()
    await sheet.getByRole('button', { name: /Контакт/ }).click()
    await check(page.getByRole('dialog', { name: 'Контакт' }))
    await sheet.getByRole('radio', { name: 'Выбрать' }).click()
    await check(page.getByRole('dialog', { name: 'Выберите группы' }))

    await page.goto('/groups')
    await page.locator('main input[aria-label$=" 1"]').check()
    await page.getByRole('button', { name: 'Новый список из отмеченных' }).click()
    await page.getByLabel('Название списка').fill(`Проверка ${width}`)
    await page.getByRole('button', { name: 'Создать список' }).click()
    await page.getByRole('button', { name: 'Действия со списком' }).click()
    await page.getByRole('menuitem', { name: 'Удалить список' }).click()
    await check(page.getByRole('dialog', { name: /Удалить список/ }))

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Изменить окно и лимиты' }).click()
    await check(page.getByRole('dialog', { name: 'Рабочее окно и лимиты' }))
    await page.getByRole('button', { name: 'Изменить', exact: true }).click()
    await check(page.getByRole('dialog', { name: 'Автоответчик' }))
    await context.close()
  })
}

test('выход сразу возвращает на страницу входа', async ({ browser }) => {
  test.setTimeout(150_000)
  for (const width of [390, 1440]) {
    const { context, page } = await open(browser, width)
    await page.evaluate(() => Object.assign(window, { sameDocument: true }))
    await page.getByRole('button', { name: 'Выйти' }).first().click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
    expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true)
    await page.goto('/campaigns')
    await expect(page).toHaveURL(/\/login$/)
    await context.close()
  }
})

test('удалённые группы из списка не попадают в выбор', async ({ browser }) => {
  const { context, page } = await open(browser, 1024)
  const jids = await page.evaluate(async () => ((await (await fetch('/api/groups')).json()) as { jid: string }[]).map((g) => g.jid))
  await page.route('**/api/admin/group-lists', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ json: [{ id: 77, name: 'Со старыми группами', groups: [...jids, 'left-1@g.us', 'left-2@g.us', 'left-3@g.us'] }] })
  })
  await page.goto('/campaigns/new')
  await page.getByRole('radio', { name: 'Выбрать' }).click()
  const dialog = page.getByRole('dialog', { name: 'Выберите группы' })
  await dialog.getByLabel('Сохранённые списки').selectOption({ label: `Со старыми группами · ${GROUPS + 3}` })
  await expect(dialog).toContainText(`Выбрано: ${GROUPS} из ${GROUPS}`)
  await expect(dialog.getByText(`Выбрано: ${GROUPS}`, { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('dialog', { name: 'Новая заявка' })).toContainText(`${GROUPS} группы`)
  await context.close()
})

test('состав списка меняется в одном месте и обновляется одной кнопкой', async ({ browser }) => {
  test.setTimeout(150_000)
  for (const width of [390, 1024]) {
    const { context, page } = await open(browser, width)
    await page.goto('/groups')
    await page.getByRole('button', { name: 'Новый список' }).click()
    await page.getByLabel('Название списка').fill(`Три ${width}`)
    for (const n of [1, 2, 3]) await page.locator(`main input[aria-label$=" ${n}"]`).check()
    await expect(page.getByText('В списке 3 группы')).toBeVisible()
    await page.getByRole('button', { name: 'Создать список' }).click()
    const chip = page.getByRole('radio', { name: new RegExp(`^Три ${width}`) })
    await expect(chip).toHaveAttribute('aria-checked', 'true')
    await expect(chip).toContainText('3')

    await page.locator('main input[aria-label$=" 2"]').check()
    await expect(page.getByRole('button', { name: 'Сохранить как список' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Убрать из/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Изменить состав' }).click()
    await page.getByRole('radio', { name: /^В списке/ }).click()
    await page.locator(`main input[aria-label$=" 2"]`).uncheck()
    await expect(page.getByText('+0 −1')).toBeVisible()
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Обновить список' }).click()
    await expect(chip).toContainText('2')
    await expect(page.locator('main input[aria-label$=" 2"]')).toHaveCount(0)
    await page.screenshot({ path: `e2e-results/ui/${width}-list.png` })
    await context.close()
  }
})

for (const width of [390, 1440]) {
  test(`открытый список «Кому» не сдвигает превью · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    const created = await page.evaluate(async () => {
      const groups = ((await (await fetch('/api/groups?activeOnly=true')).json()) as { jid: string }[]).slice(0, 2).map((g) => g.jid)
      const body = { content: { mode: 'text', text: 'Проверка превью' }, groups, repeat: { mode: 'ONCE' }, sendNow: false }
      const response = await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, json: await response.json() }
    })
    expect(created.status).toBe(201)
    await page.route(`**/api/admin/campaigns/${created.json.id}`, async (route) => {
      const response = await route.fetch()
      const campaign = await response.json()
      const targets = Array.from({ length: 12 }, (_, i) => ({ jid: `${120363900000000 + i}@g.us`, name: `${NAMES[i % NAMES.length]} ${NAMES[(i + 1) % NAMES.length]}` }))
      await route.fulfill({ response, json: { ...campaign, targets } })
    })
    await page.goto(`/campaigns/${created.json.id}`)
    const sheet = page.getByRole('dialog')
    const bubble = sheet.getByText('Проверка превью', { exact: true })
    const before = await box(bubble)
    await sheet.locator('summary').click()
    await expect(sheet.locator('details li').first()).toBeVisible()
    const after = await box(bubble)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    await context.close()
  })
}
