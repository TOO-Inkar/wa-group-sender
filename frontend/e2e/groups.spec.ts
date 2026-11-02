import { expect, test, type Browser, type Page } from '@playwright/test'
import { PASSWORD } from './support/campaign-card'

const UNARCHIVED = [1, 2, 3]
const ADMIN_ONLY = [4, 5]

async function openGroups(browser: Browser, width: number): Promise<Page> {
  const phone = width < 768
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  await page.goto('/groups')
  return page
}

const row = (page: Page, n: number) => page.locator('main label').filter({ has: page.getByRole('checkbox', { name: `Тестовая группа ${n}`, exact: true }) })

for (const width of [360, 1440]) {
  test(`у каждой группы не в рассылке видна причина · ${width}`, async ({ browser }) => {
    const page = await openGroups(browser, width)
    await page.getByRole('radio', { name: /Не в рассылке/ }).click()
    await expect(page.locator('main').getByRole('checkbox', { name: /^Тестовая группа / })).toHaveCount(UNARCHIVED.length + ADMIN_ONLY.length)
    for (const n of UNARCHIVED) {
      await expect(row(page, n)).toContainText('не в архиве')
      await expect(row(page, n)).toContainText('заархивируйте группу в WhatsApp и нажмите «Обновить»')
      await expect(row(page, n)).not.toContainText('в рассылке')
    }
    for (const n of ADMIN_ONLY) {
      await expect(row(page, n)).toContainText('пишут только админы')
      await expect(row(page, n)).toContainText('сделайте номер админом группы')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `e2e-results/groups/blocked-${width}.png`, fullPage: true })
    await page.context().close()
  })
}
