import { expect, test, type Browser } from '@playwright/test'
import { openCard, PASSWORD } from './support/campaign-card'
import { expectReadable } from './support/select'

const WIDTHS = [360, 1440]
const LIST_NAME = 'Грузоперевозки Казахстан Россия'
const LIST_SIZE = 284
const LONGEST_INTERVAL = 'каждые 1,5 часа'
const TIME_FIELDS = ['С', 'До']

test.describe.configure({ mode: 'parallel' })

async function open(browser: Browser, width: number) {
  const phone = width < 768
  const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  const groups = Array.from({ length: LIST_SIZE }, (_, i) => `${120363900000000 + i}@g.us`)
  await page.route('**/api/admin/group-lists', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [{ id: 1, name: LIST_NAME, groups }] }) : route.fallback()))
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  return { context, page }
}

for (const width of WIDTHS) {
  test(`выпадающие списки заявки и настроек читаются целиком · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width)
    await page.goto('/campaigns/new')
    const sheet = page.getByRole('dialog', { name: 'Новая заявка' })

    await sheet.getByRole('radio', { name: 'Список' }).click()
    const list = sheet.getByRole('combobox')
    await list.selectOption({ label: `${LIST_NAME} · ${LIST_SIZE}` })
    await expectReadable(list, 'список групп')

    await sheet.getByRole('radio', { name: 'Повтор' }).click()
    const interval = sheet.getByRole('combobox', { name: 'Как часто' })
    await interval.selectOption({ label: LONGEST_INTERVAL })
    await expectReadable(interval, 'как часто')
    for (const name of TIME_FIELDS) await expectReadable(sheet.getByRole('button', { name, exact: true }), name)

    await sheet.getByRole('radio', { name: 'Выбрать' }).click()
    const picker = page.getByRole('dialog', { name: 'Выберите группы' })
    await expectReadable(picker.getByRole('combobox', { name: 'Сохранённые списки' }), 'сохранённые списки')
    await page.keyboard.press('Escape')

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Изменить окно и лимиты' }).click()
    const limits = page.getByRole('dialog', { name: 'Рабочее окно и лимиты' })
    for (const name of TIME_FIELDS) await expectReadable(limits.getByRole('button', { name, exact: true }), name)
    await context.close()
  })

  test(`выбор запуска в карточке читается целиком · ${width}`, async ({ browser }) => {
    const page = await openCard(browser, width, 'sending')
    const select = page.getByRole('dialog').getByRole('combobox', { name: 'Рассылка' })
    for (const label of await select.locator('option').allTextContents()) {
      await select.selectOption({ label })
      await expectReadable(select, label)
    }
    await page.context().close()
  })
}
