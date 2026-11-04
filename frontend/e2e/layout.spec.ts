import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { CAMPAIGN_ID } from './support/campaign-card'
import { EDGE_TOLERANCE_PX, expectLayout, pointerIsCoarse, type CheckName } from './support/layout'
import { LONG_LIST, mockLayoutData, SHORT_LIST } from './support/layout-data'
import { mockPlatform } from './support/platform'
import { login, newPage, pointerFor, type Pointer, type Scheme } from './support/session'

const WIDTHS = [360, 390, 768, 1024, 1440]
const TOUCH_TABLET = 1024
const DARK_WIDTHS = [390, 1440]
const CLICK_TIMEOUT = 5_000
const SHOTS = 'e2e-results/layout'
const PLATFORM_TENANT = 2

test.describe.configure({ mode: 'parallel' })

async function settle(page: Page) {
  await page.mouse.move(0, 0)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

function scenes(page: Page, tag: string, only?: CheckName[]) {
  return async (scene: string) => {
    await settle(page)
    await page.screenshot({ path: `${SHOTS}/${tag}-${scene}.png` })
    await expectLayout(page, `${scene} · ${tag}`, only)
  }
}

async function session(
  browser: Browser,
  width: number,
  pointer: Pointer = pointerFor(width),
  colorScheme: Scheme = 'light',
) {
  const page = await newPage(browser, width, { pointer, colorScheme })
  expect(await pointerIsCoarse(page), `эмуляция pointer: ${pointer}`).toBe(pointer === 'coarse')
  await mockLayoutData(page)
  await login(page)
  return page
}

async function closeWith(page: Page, layer: Locator) {
  await page.keyboard.press('Escape')
  await expect(layer).toBeHidden()
}

const flows: Record<string, (page: Page, check: (scene: string) => Promise<void>) => Promise<void>> = {
  async campaigns(page, check) {
    await page.goto('/campaigns')
    await expect(
      page
        .getByText(/Китай → Казахстан/)
        .locator('visible=true')
        .first(),
    ).toBeVisible()
    await check('campaigns')

    await page.getByRole('button', { name: 'Отчёт' }).click()
    const report = page.getByRole('dialog', { name: 'Отчёт для заказчика' })
    await expect(report).toBeVisible()
    await check('campaigns-report')
    await closeWith(page, report)

    await page.getByRole('button', { name: 'Действия' }).locator('visible=true').first().click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await check('campaigns-row-menu')
    await menu.getByRole('menuitem', { name: 'Удалить' }).click()
    const confirm = page.getByRole('dialog', { name: /^Удалить №/ })
    await expect(confirm).toBeVisible()
    await check('campaigns-confirm')
    await closeWith(page, confirm)
  },

  async 'campaign-new'(page, check) {
    await page.goto('/campaigns/new')
    const sheet = page.getByRole('dialog', { name: 'Новая заявка' })
    await expect(sheet).toBeVisible()
    await check('new')

    await sheet.getByRole('radio', { name: 'Список' }).click()
    await sheet
      .getByRole('combobox')
      .first()
      .selectOption({ label: `${SHORT_LIST.name} · ${SHORT_LIST.size}` })
    await check('new-list')

    await sheet.getByRole('radio', { name: 'Один раз' }).click()
    const time = sheet.getByRole('button', { name: 'Время', exact: true })
    await expect(time).toBeVisible()
    await check('new-once')
    await time.click()
    const menu = page.getByRole('menu', { name: 'Время' })
    await expect(menu).toBeVisible()
    await check('new-time-menu')
    await closeWith(page, menu)

    await sheet.getByRole('radio', { name: 'Повтор' }).click()
    await sheet.getByRole('button', { name: /например/ }).click()
    await expect(sheet.getByRole('button', { name: 'Доп. время 1' })).toBeVisible()
    await check('new-interval')

    await sheet.getByRole('radio', { name: 'Готовый текст' }).click()
    await sheet
      .getByRole('button', { name: /Контакт/ })
      .first()
      .click()
    const contact = page.getByRole('dialog', { name: 'Контакт' })
    await expect(contact).toBeVisible()
    await check('new-contact')
    await closeWith(page, contact)

    await sheet.getByRole('radio', { name: 'Выбрать' }).click()
    const picker = page.getByRole('dialog', { name: 'Выберите группы' })
    await expect(picker.getByRole('checkbox').first()).toBeVisible()
    await check('new-picker')
    await picker
      .getByRole('combobox', { name: 'Сохранённые списки' })
      .selectOption({ label: `${LONG_LIST.name} · ${LONG_LIST.size}` })
    await check('new-picker-list')
    await closeWith(page, picker)
  },

  async 'campaign-card'(page, check) {
    await page.goto(`/campaigns/${CAMPAIGN_ID}`)
    const card = page.getByRole('dialog')
    await expect(card.getByRole('list', { name: 'Группы рассылки' }).getByRole('listitem').first()).toBeVisible()
    await check('card')
  },

  async groups(page, check) {
    await page.goto('/groups')
    await expect(page.locator('main input[aria-label$=" 1"]')).toBeVisible()
    await check('groups')

    await page.locator('main input[aria-label$=" 1"]').check()
    await check('groups-selected')

    await page.getByRole('radio', { name: new RegExp(`^${SHORT_LIST.name}`) }).click()
    await expect(page.getByRole('button', { name: 'Действия со списком' })).toBeVisible()
    await check('groups-list')
    await page.getByRole('button', { name: 'Действия со списком' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await check('groups-list-menu')
    await menu.getByRole('menuitem', { name: 'Удалить список' }).click()
    const confirm = page.getByRole('dialog', { name: /Удалить список/ })
    await expect(confirm).toBeVisible()
    await check('groups-confirm')
    await closeWith(page, confirm)

    await page.getByRole('button', { name: 'Новый список' }).click()
    await expect(page.getByLabel('Название списка')).toBeVisible()
    await check('groups-new-list')
  },

  async platform(page, check) {
    await mockPlatform(page)
    await page.goto('/groups')
    const switcher = page.getByRole('button', { name: 'Кабинет: Кабинет 1. Сменить кабинет' })
    await expect(switcher).toBeVisible()
    await check('platform-shell')
    await switcher.click()
    const cabinets = page.getByRole('dialog', { name: 'Кабинеты' })
    await expect(cabinets.getByRole('button', { name: /Логистик Плюс/ })).toBeVisible()
    await check('platform-switcher')
    await closeWith(page, cabinets)

    await page.goto('/platform')
    await expect(page.locator('main').getByText('Логистик Плюс').locator('visible=true')).toBeVisible()
    await check('platform-tenants')
    await page.getByRole('button', { name: 'Создать кабинет' }).click()
    const create = page.getByRole('dialog', { name: 'Новый кабинет' })
    await create.getByRole('button', { name: 'Создать кабинет' }).click()
    await expect(create).toContainText('Введите название')
    await check('platform-create')
    await closeWith(page, create)

    await page.goto(`/platform/tenants/${PLATFORM_TENANT}`)
    const sheet = page.getByRole('dialog', { name: 'Логистик Плюс' })
    await expect(sheet.getByRole('button', { name: 'Действия: logist' })).toBeVisible()
    await check('platform-tenant')
    await sheet.getByRole('button', { name: 'Удалить', exact: true }).click()
    const remove = page.getByRole('dialog', { name: 'Удалить «Логистик Плюс»?' })
    await expect(remove).toBeVisible()
    await check('platform-delete')
    await closeWith(page, remove)
    await closeWith(page, sheet)

    await page.goto('/platform/audit')
    await expect(page.getByText('Неудачный вход', { exact: true }).locator('visible=true')).toBeVisible()
    await check('platform-audit')
  },

  async connection(page, check) {
    await page.goto('/connection')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await check('connection')
  },

  async settings(page, check) {
    await page.goto('/settings')
    await expect(page.getByText('получает', { exact: true }).first()).toBeVisible()
    await check('settings')

    await page.getByRole('button', { name: 'Изменить окно и лимиты' }).click()
    const limits = page.getByRole('dialog', { name: 'Рабочее окно и лимиты' })
    await expect(limits).toBeVisible()
    await check('settings-limits')
    await closeWith(page, limits)

    await page.getByRole('button', { name: 'Изменить', exact: true }).click()
    const reply = page.getByRole('dialog', { name: 'Автоответчик' })
    await expect(reply).toBeVisible()
    await check('settings-autoreply')
    await closeWith(page, reply)

    await page.getByRole('button', { name: 'Удалить', exact: true }).first().click()
    const confirm = page.getByRole('dialog', { name: 'Удалить подписчика?' })
    await expect(confirm).toBeVisible()
    await check('settings-confirm')
    await closeWith(page, confirm)

    await page.getByRole('button', { name: 'Сменить пароль' }).click({ timeout: CLICK_TIMEOUT })
    await expect(page.getByLabel('Текущий пароль')).toHaveAttribute('aria-invalid', 'true')
    await check('settings-password-errors')
  },
}

async function cardBox(locator: Locator) {
  return locator.evaluate((el) => {
    let node = el.parentElement
    while (
      node &&
      !(
        parseFloat(getComputedStyle(node).borderTopLeftRadius) > 0 && parseFloat(getComputedStyle(node).paddingLeft) > 0
      )
    )
      node = node.parentElement
    const r = (node ?? document.body).getBoundingClientRect()
    return { left: r.left, right: r.right }
  })
}

for (const width of WIDTHS) {
  test(`вёрстка входа · ${width}`, async ({ browser }) => {
    const page = await newPage(browser, width)
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
    await scenes(page, `${width}px`)('login')
    await page.context().close()
  })

  for (const [flow, run] of Object.entries(flows))
    test(`вёрстка ${flow} · ${width}`, async ({ browser }) => {
      const page = await session(browser, width)
      await run(page, scenes(page, `${width}px`))
      await page.context().close()
    })

  test(`Telegram-карточка не вылезает за край · ${width}`, async ({ browser }) => {
    const page = await session(browser, width)
    await page.goto('/settings')
    const title = page.getByRole('heading', { name: 'Уведомления в Telegram' })
    await expect(title).toBeVisible()
    const card = await cardBox(title)
    const parts = [
      ['ссылка t.me', page.locator('a[href^="https://t.me/"]')],
      ['кнопка копирования', page.getByRole('button', { name: /Скопировать/ })],
      ['бейдж «получает»', page.getByText('получает', { exact: true })],
    ] as const
    for (const [label, locator] of parts) {
      await expect(locator.first()).toBeVisible()
      for (const item of await locator.all()) {
        const b = (await item.boundingBox())!
        const where = `${label}: x ${b.x.toFixed(1)}..${(b.x + b.width).toFixed(1)}, карточка ${card.left.toFixed(1)}..${card.right.toFixed(1)}`
        expect.soft(b.x, where).toBeGreaterThanOrEqual(card.left - EDGE_TOLERANCE_PX)
        expect.soft(b.x + b.width, where).toBeLessThanOrEqual(card.right + EDGE_TOLERANCE_PX)
      }
    }
    await page.context().close()
  })
}

test(`высота контролов на сенсорном планшете · ${TOUCH_TABLET}`, async ({ browser }) => {
  const page = await session(browser, TOUCH_TABLET, 'coarse')
  const check = scenes(page, `${TOUCH_TABLET}px-touch`, ['controlHeights'])
  await check('touch-campaigns')
  await flows['campaign-new']!(page, check)
  await page.context().close()
})

for (const width of DARK_WIDTHS)
  test(`контраст в тёмной теме · ${width}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const page = await session(browser, width, pointerFor(width), 'dark')
    const check = scenes(page, `${width}px-dark`, ['contrast'])
    for (const run of Object.values(flows)) await run(page, check)
    await page.context().close()
  })
