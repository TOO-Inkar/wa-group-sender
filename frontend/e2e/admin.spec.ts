import { expect, test, type Page } from '@playwright/test'

const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-pass'

async function login(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль').fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
}

test('неверный пароль — понятная ошибка, верный — вход', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль').fill('wrong')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('alert')).toContainText('Неверный логин или пароль')
  await page.getByLabel('Пароль').fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible()
})

test('заявка по полям: Enter по полям, повтор, список заявок', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Новая заявка' }).first().click()

  const route = page.getByPlaceholder('ХОРГОС → БАКУ')
  await route.fill('ХОРГОС → БАКУ')
  await route.press('Enter')
  await expect(page.getByPlaceholder('Срочно, груз готов')).toBeFocused()
  await page.keyboard.type('Срочно')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Тент 20 т')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('Реф 22 т')
  await page.keyboard.press('Enter')
  await expect(page.getByPlaceholder('Цемент')).toBeFocused()
  await page.keyboard.type('Мука')
  await page.keyboard.press('Enter')
  await expect(page.getByPlaceholder('Необязательно, можно несколько строк')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByPlaceholder('450 000 ₸')).toBeFocused()
  await page.keyboard.type('450 000 ₸')
  await expect(page.getByPlaceholder('120 м³ / 5 осей — 20 т')).toHaveValue('Тент 20 т\nРеф 22 т')
  await expect(page.locator('text=Реф 22 т').last()).toBeVisible()

  await page.getByText('Повторять в течение дня').click()
  await page.getByRole('button', { name: 'Сохранить и запланировать' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click()
  await expect(page).toHaveURL(/\/campaigns\/\d+$/)
  await expect(page.getByText('каждые 2 часа с 08:00 до 23:00').first()).toBeVisible()
  await page.screenshot({ path: 'e2e-results/campaign.png', fullPage: true })
})

test('список групп: заявка в список показывает его название', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Группы', exact: true }).click()
  const boxes = page.locator('tbody input[type=checkbox]:not([disabled])')
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await page.getByRole('button', { name: 'Сохранить как список' }).click()
  await page.getByPlaceholder('Название, например Тест').fill('Тест')
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click()
  await page.getByRole('button', { name: 'Заявка в список' }).click()

  await page.getByPlaceholder('ХОРГОС → БАКУ').fill('АЛМАТЫ → АСТАНА')
  await page.getByPlaceholder('Срочно, груз готов').fill('Завтра')
  await page.getByPlaceholder('120 м³ / 5 осей — 20 т').fill('Тент')
  await page.getByPlaceholder('Цемент').fill('Мука')
  await page.getByPlaceholder('450 000 ₸').fill('🔥')
  await page.getByPlaceholder('450 000 ₸').press('Control+Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить' }).click()
  await expect(page).toHaveURL(/\/campaigns\/\d+$/)
  await page.getByRole('navigation').getByRole('link', { name: /^Заявки/ }).click()
  await expect(page.getByRole('link', { name: /АЛМАТЫ → АСТАНА/ }).first()).toContainText('· Тест ·')
})

test('настройки: окно и лимиты меняются в модальном окне', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: /Рабочее окно/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('До', { exact: true }).fill('22:30')
  await dialog.getByLabel('Лимит в час').fill('90')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: /Рабочее окно/ })).toContainText('90 в час')
  await page.screenshot({ path: 'e2e-results/settings.png', fullPage: true })
})

test('телефон: меню и список заявок помещаются @phone', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
