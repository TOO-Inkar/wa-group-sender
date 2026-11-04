import { expect, type Page } from '@playwright/test'

export const DESKTOP_CONTROL = { min: 32, max: 36 }
export const COARSE_CONTROL = 44

export async function expectControlHeight(page: Page, height: number, name?: string) {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  if (coarse) {
    expect(height, name).toBeGreaterThanOrEqual(COARSE_CONTROL)
    return
  }
  expect(height, name).toBeGreaterThanOrEqual(DESKTOP_CONTROL.min)
  expect(height, name).toBeLessThanOrEqual(DESKTOP_CONTROL.max)
}
