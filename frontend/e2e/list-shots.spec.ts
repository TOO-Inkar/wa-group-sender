import { expect, test, type Page } from '@playwright/test'
import { mockBulkGroups } from './support/bulk-groups'
import { CAMPAIGN_ID, mockCard } from './support/campaign-card'
import { settleLayout } from './support/layout'
import { login, newPage } from './support/session'

const WIDTHS = [360, 390, 768, 1024, 1440]
const GROUPS = 1000
const SHOTS = 'e2e-results/fixes/after'

async function shot(page: Page, name: string, width: number) {
  await settleLayout(page)
  await page.screenshot({ path: `${SHOTS}/${name}-${width}.png` })
}

for (const width of WIDTHS) {
  test(`снимки списков групп · ${width}`, async ({ browser }) => {
    const page = await newPage(browser, width)
    await mockBulkGroups(page, GROUPS)
    await mockCard(page, 'sending')
    await login(page)

    await page.goto('/groups')
    await expect(page.locator('main input[type=checkbox][aria-label]').first()).toBeVisible()
    await shot(page, 'groups', width)
    await page.screenshot({ path: `${SHOTS}/groups-full-${width}.png`, fullPage: true })
    await page.getByRole('navigation', { name: 'Страницы групп' }).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await shot(page, 'groups-pager', width)

    await page.getByRole('button', { name: 'Новый список' }).click()
    await expect(page.getByLabel('Название списка')).toBeVisible()
    await shot(page, 'list-composer', width)

    await page.goto('/campaigns/new')
    await page.getByRole('radio', { name: 'Выбрать' }).click()
    const picker = page.getByRole('dialog', { name: 'Выберите группы' })
    await expect(picker.getByRole('checkbox').nth(2)).toBeVisible()
    await shot(page, 'picker', width)
    await picker.locator('[data-dialog-body]').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await shot(page, 'picker-bottom', width)

    await page.goto(`/campaigns/${CAMPAIGN_ID}`)
    const card = page.getByRole('dialog')
    await expect(card.getByRole('list', { name: 'Группы рассылки' }).getByRole('listitem').first()).toBeVisible()
    await card.getByRole('navigation', { name: 'Страницы получателей' }).evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await shot(page, 'card-recipients', width)
    await card.getByRole('searchbox', { name: 'Найти группу' }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await shot(page, 'card-results', width)
    await card.getByRole('navigation', { name: 'Страницы результатов' }).evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await shot(page, 'card-results-pager', width)
    await page.context().close()
  })
}
