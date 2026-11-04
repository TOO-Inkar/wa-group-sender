import { expect, type Browser, type Page } from '@playwright/test'

export const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-pass'
export const TABLET = 768

export type Pointer = 'fine' | 'coarse'
export type Scheme = 'light' | 'dark'

export const pointerFor = (width: number): Pointer => (width < TABLET ? 'coarse' : 'fine')

export async function newPage(
  browser: Browser,
  width: number,
  {
    height = 900,
    pointer = pointerFor(width),
    colorScheme = 'light',
  }: { height?: number; pointer?: Pointer; colorScheme?: Scheme } = {},
) {
  const touch = pointer === 'coarse'
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: touch,
    hasTouch: touch,
    colorScheme,
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  })
  return context.newPage()
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Логин').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
}
