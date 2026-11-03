import { expect, type Locator } from '@playwright/test'

export async function clippedBy(control: Locator) {
  return control.evaluate((el) => {
    const style = getComputedStyle(el)
    const overflow = el.scrollWidth - el.clientWidth
    if (!(el instanceof HTMLSelectElement)) return overflow
    const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const context = document.createElement('canvas').getContext('2d')!
    context.font = style.font
    return Math.max(overflow, context.measureText(el.selectedOptions[0]?.text ?? '').width - inner)
  })
}

export async function expectReadable(control: Locator, name: string) {
  await expect(control).toBeVisible()
  expect(await clippedBy(control), name).toBeLessThanOrEqual(0)
}
