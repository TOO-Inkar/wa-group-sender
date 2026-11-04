import { expect, test } from '@playwright/test'
import { PASSWORD } from './support/campaign-card'

test('паузу между группами можно задать в долях секунды', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 900 }, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  await page.goto('/settings')

  const edit = async () => {
    await page.getByRole('button', { name: 'Изменить окно и лимиты' }).click()
    const dialog = page.getByRole('dialog', { name: 'Рабочее окно и лимиты' })
    await dialog.getByText('Паузы — меняйте осторожно').click()
    return dialog
  }

  let dialog = await edit()
  await dialog.getByLabel('Между группами, от, с').fill('1.5')
  await dialog.getByLabel('до, с').fill('2.5')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()

  await page.reload()
  dialog = await edit()
  await expect(dialog.getByLabel('Между группами, от, с')).toHaveValue('1.5')
  await expect(dialog.getByLabel('до, с')).toHaveValue('2.5')
  await context.close()
})
