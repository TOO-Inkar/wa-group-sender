import { expect, test, type Page } from '@playwright/test'

const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-pass'
const MEMBER_PASSWORD = 'member-pass-123'

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, json: response.headers.get('content-type')?.includes('json') ? await response.json() : null }
    },
    { method, path, body },
  )
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Логин').fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
}

test('новый кабинет изолирован: участник входит и не видит данных первого кабинета', async ({ browser }) => {
  const suffix = Date.now().toString(36)
  const tenantName = `Изоляция ${suffix}`
  const member = `iso${suffix}`
  const listName = `Только первый ${suffix}`

  const owner = await browser.newContext()
  const ownerPage = await owner.newPage()
  await signIn(ownerPage, 'admin', PASSWORD)
  const groups = (await api(ownerPage, 'GET', '/api/groups')).json as { jid: string }[]
  expect((await api(ownerPage, 'PUT', '/api/admin/group-lists', { name: listName, groups: [groups[0].jid] })).status).toBe(200)

  await ownerPage.goto('/platform')
  await ownerPage.getByRole('button', { name: 'Создать кабинет' }).click()
  const dialog = ownerPage.getByRole('dialog', { name: 'Новый кабинет' })
  await dialog.getByLabel('Название кабинета').fill(tenantName)
  await dialog.getByLabel('Логин').fill(member)
  await dialog.getByRole('textbox', { name: /^Пароль/ }).fill(MEMBER_PASSWORD)
  await dialog.getByRole('button', { name: 'Создать кабинет' }).click()
  await expect(ownerPage.getByRole('dialog', { name: 'Кабинет создан' })).toContainText(member)
  await owner.close()

  const guest = await browser.newContext()
  const page = await guest.newPage()
  await signIn(page, member, MEMBER_PASSWORD)
  await expect(page.getByText(tenantName, { exact: true }).locator('visible=true')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Админка' })).toHaveCount(0)

  const lists = (await api(page, 'GET', '/api/admin/group-lists')).json as { name: string }[]
  expect(lists.map((l) => l.name)).not.toContain(listName)
  expect((await api(page, 'GET', '/api/platform/tenants')).status).toBe(403)

  await page.goto('/platform')
  await expect(page).toHaveURL(/\/campaigns$/)
  await guest.close()
})
