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
    const [sample] = (await response.json()) as Record<string, unknown>[]
    const groups = Array.from({ length: GROUPS }, (_, i) => ({
      ...sample,
      jid: `${120363900000000 + i}@g.us`,
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
    await expect(menu.getByRole('menuitemradio', { checked: true })).toBeInViewport()
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
    await menu.getByRole('menuitemradio', { name: '14:35' }).click()
    await expect(trigger).toHaveText('14:35')
    await context.close()
  })

  test(`табы на заявках и группах одинаковые · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    const style = async () => {
      const active = page.getByRole('radio', { name: /^Все/ })
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
    await page.locator('main input[aria-label$=" 2"]').check()
    await page.getByRole('button', { name: 'Сохранить как список' }).click()
    const save = page.getByRole('dialog', { name: 'Новый список групп' })
    await expectDialogFits(page, save)
    await save.getByPlaceholder('Например, Тест').fill(`Проверка ${width}`)
    await save.getByRole('button', { name: 'Сохранить' }).click()
    await expect(save).toBeHidden()
    await page.getByRole('button', { name: 'Действия со списком' }).click()
    await page.getByRole('menuitem', { name: 'Изменить список' }).click()
    await check(page.getByRole('dialog', { name: 'Изменить список' }))
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
