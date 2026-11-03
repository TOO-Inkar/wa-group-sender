import { expect, test, type Browser, type Page, type Route } from '@playwright/test'

const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-pass'
const WIDTHS = [360, 390, 768, 1024, 1440]
const DESKTOP = 1280
const ENTER_URL = '/api/auth/enter?code=e2e-code'

type Role = 'SUPERADMIN' | 'MEMBER'
type Tenant = Record<string, unknown> & { id: number; name: string; status: string; proxy: string | null }
type Call = { method: string; path: string; body: unknown }

test.describe.configure({ mode: 'parallel' })

const tenant = (id: number, name: string, patch: Partial<Tenant> = {}): Tenant => ({
  id,
  name,
  status: 'ACTIVE',
  legacy: false,
  createdAt: '2026-10-01T05:00:00Z',
  users: 1,
  session: 'CONNECTED',
  account: `7700000000${id}`,
  dispatcher: 'running',
  activeGroups: 40 + id,
  sentToday: 120 + id,
  sentLastHour: 10 + id,
  queueLength: id,
  stoppedByRisk: false,
  proxy: `socks5://10.0.0.${id}:1080`,
  proxyRequired: true,
  ...patch,
})

function platform() {
  const tenants: Tenant[] = [
    tenant(1, 'Кабинет 1', { legacy: true, proxy: null }),
    tenant(2, 'Логистик Плюс', { users: 2 }),
    tenant(3, 'Без прокси ТОО', { proxy: null, session: 'WAITING_QR', account: null, dispatcher: 'waiting-session' }),
  ]
  const users = [
    { id: 21, login: 'logist', enabled: true, createdAt: '2026-10-01T05:00:00Z', lastLoginAt: '2026-10-26T05:00:00Z' },
    { id: 22, login: 'manager', enabled: true, createdAt: '2026-10-02T05:00:00Z', lastLoginAt: null },
  ]
  const calls: Call[] = []
  const audit = [
    { at: '2026-10-27T04:00:00Z', actor: 'admin', tenantId: 2, tenantName: 'Логистик Плюс', action: 'ENTER', detail: null, ip: '10.1.1.1' },
    { at: '2026-10-27T03:00:00Z', actor: 'logist', tenantId: 2, tenantName: 'Логистик Плюс', action: 'LOGIN_FAILED', detail: 'неверный пароль', ip: '10.1.1.2' },
    { at: '2026-10-27T02:00:00Z', actor: 'admin', tenantId: 3, tenantName: 'Без прокси ТОО', action: 'TENANT_CREATED', detail: null, ip: '10.1.1.1' },
  ]

  const handle = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/platform', '')
    const method = request.method()
    const body = request.postDataJSON() as Record<string, unknown> | null
    calls.push({ method, path: path + url.search, body })
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data })
    const id = Number(path.split('/')[2])
    const found = tenants.find((t) => t.id === id)

    if (method === 'GET' && path === '/tenants') return json(tenants)
    if (method === 'POST' && path === '/tenants') {
      const created = tenant(tenants.length + 10, String(body?.name), { proxy: body?.proxy ? 'socks5://masked:1080' : null, session: 'WAITING_QR', account: null })
      tenants.push(created)
      return json(created, 201)
    }
    if (method === 'PATCH' && found && path === `/tenants/${id}`) {
      Object.assign(found, body)
      if (body && 'proxy' in body) found.proxy = body.proxy ? 'socks5://new-host:1080' : null
      return json(found)
    }
    if (method === 'POST' && found && path.endsWith('/delete')) {
      tenants.splice(tenants.indexOf(found), 1)
      return route.fulfill({ status: 204 })
    }
    if (method === 'POST' && path.endsWith('/enter')) return json({ url: ENTER_URL })
    if (method === 'POST' && path.endsWith('/proxy-check')) return json({ ok: true, ip: '203.0.113.7', country: 'KZ', city: 'Almaty', org: 'Tele2', whatsapp: true })
    if (method === 'GET' && path.endsWith('/users')) return json(users)
    if (method === 'POST' && path.endsWith('/users')) return json({ id: 99, login: body?.login, enabled: true, createdAt: '2026-10-27T05:00:00Z', lastLoginAt: null }, 201)
    if (method === 'PATCH' && path.startsWith('/users/')) return json({ ...users[0], ...body })
    if (method === 'DELETE' && path.startsWith('/users/')) return route.fulfill({ status: 204 })
    if (method === 'GET' && path === '/audit') return json(url.searchParams.get('tenantId') ? audit.filter((a) => String(a.tenantId) === url.searchParams.get('tenantId')) : audit)
    return json({ message: 'not mocked' }, 404)
  }

  return { tenants, calls, handle }
}

async function open(browser: Browser, width: number, role: Role) {
  const phone = width < 768
  const context = await browser.newContext({ viewport: { width, height: 820 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', timezoneId: 'Asia/Almaty' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })
  expect(login.ok()).toBeTruthy()
  const fake = platform()
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { authenticated: true, username: role === 'SUPERADMIN' ? 'owner' : 'logist', role, tenant: { id: 1, name: 'Кабинет 1' } } }),
  )
  await page.route('**/api/platform/**', fake.handle)
  return { context, page, fake }
}

const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).locator('visible=true')

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

async function openTenant(page: Page, width: number, name: string) {
  if (width >= DESKTOP) await page.getByRole('row', { name: new RegExp(name) }).click()
  else await page.getByRole('button', { name, exact: true }).click()
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  return sheet
}

for (const width of WIDTHS) {
  test(`суперадмин: переключатель кабинетов и вход · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/campaigns')
    const switcher = page.getByRole('button', { name: 'Кабинет: Кабинет 1. Сменить кабинет' })
    await expect(switcher).toBeVisible()
    if (width >= 768) await expect(page.getByRole('link', { name: 'Админка' })).toBeVisible()
    await switcher.click()
    const dialog = page.getByRole('dialog', { name: 'Кабинеты' })
    await expect(dialog.getByRole('button', { name: /Логистик Плюс/ })).toBeVisible()
    await dialog.getByRole('searchbox').fill('без')
    await expect(dialog.getByRole('button', { name: /Логистик Плюс/ })).toBeHidden()
    await dialog.getByRole('searchbox').fill('')
    await page.screenshot({ path: `e2e-results/switcher-${width}.png` })
    await page.route('**/api/auth/enter**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>entered</p>' }))
    await dialog.getByRole('button', { name: /Логистик Плюс/ }).click()
    await expect(page).toHaveURL(new RegExp(`${ENTER_URL.replace('?', '\\?')}$`))
    await context.close()
  })

  test(`суперадмин: админка, журнал с фильтром · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/campaigns')
    await page.getByRole('button', { name: 'Кабинет: Кабинет 1. Сменить кабинет' }).click()
    await page.getByRole('link', { name: 'Управление кабинетами' }).click()
    await expect(page).toHaveURL(/\/platform$/)
    await expect(page.getByRole('heading', { name: 'Кабинеты' })).toBeVisible()
    await expect(page.getByText('Без прокси: 1')).toBeVisible()
    const list = width >= DESKTOP ? page.getByRole('table') : page.locator('main ul')
    await expect(list).toContainText('Прямое подключение')
    await expect(list).toContainText('Без прокси')
    await expect(list).toContainText('Логистик Плюс')
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `e2e-results/platform-${width}.png`, fullPage: true })

    await page.getByRole('searchbox').fill('логист')
    await expect(list).not.toContainText('Без прокси ТОО')
    await page.getByRole('searchbox').fill('')

    await page.getByRole('navigation').getByRole('link', { name: 'Журнал' }).click()
    await expect(page.getByRole('heading', { name: 'Журнал' })).toBeVisible()
    await expect(shown(page, 'Неудачный вход')).toBeVisible()
    await page.getByLabel('Кабинет').selectOption({ label: '№3 Без прокси ТОО' })
    await expect(page).toHaveURL(/\/platform\/audit\?tenant=3$/)
    await expect(shown(page, 'Кабинет создан')).toBeVisible()
    await expect(page.getByText('Неудачный вход')).toHaveCount(0)
    expect(fake.calls.some((c) => c.path === '/audit?limit=100&tenantId=3')).toBe(true)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await context.close()
  })

  test(`участник не видит платформу · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'MEMBER')
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible()
    await expect(shown(page, 'Кабинет 1')).toBeVisible()
    await expect(page.getByRole('button', { name: /Сменить кабинет/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Админка' })).toHaveCount(0)
    await page.goto('/platform')
    await expect(page).toHaveURL(/\/campaigns$/)
    expect(fake.calls).toHaveLength(0)
    await context.close()
  })

  test(`создание кабинета показывает данные для входа · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/platform')
    await page.getByRole('button', { name: 'Создать кабинет' }).click()
    const dialog = page.getByRole('dialog', { name: 'Новый кабинет' })
    const password = dialog.getByRole('textbox', { name: /^Пароль/ })
    await expect(password).toHaveValue(/^[a-zA-Z2-9]{14}$/)
    const first = await password.inputValue()
    await dialog.getByRole('button', { name: /Сгенерировать/ }).click()
    await expect(password).not.toHaveValue(first)

    await dialog.getByRole('button', { name: 'Создать кабинет' }).click()
    await expect(dialog).toContainText('Введите название')
    await expect(dialog).toContainText('Введите логин')
    await dialog.getByLabel('Название кабинета').fill('Новый Транс')
    await dialog.getByLabel('Логин').fill('newtrans')
    await password.fill('short')
    await dialog.getByLabel('Прокси').fill('proxy.kz')
    await dialog.getByRole('button', { name: 'Создать кабинет' }).click()
    await expect(dialog).toContainText('Не короче 8 символов')
    await expect(dialog).toContainText('Формат: socks5://')
    expect(fake.calls.filter((c) => c.method === 'POST')).toHaveLength(0)

    await password.fill('Secret-pass-42')
    await dialog.getByLabel('Прокси').fill('socks5://user:pw@1.2.3.4:1080')
    await expectDialogFits(page)
    await dialog.getByRole('button', { name: 'Создать кабинет' }).click()
    const done = page.getByRole('dialog', { name: 'Кабинет создан' })
    await expect(done).toContainText('Пароль показывается один раз')
    await expect(done.getByLabel('Логин', { exact: true })).toHaveText('newtrans')
    await expect(done.getByLabel('Пароль', { exact: true })).toHaveText('Secret-pass-42')
    expect(fake.calls.find((c) => c.method === 'POST' && c.path === '/tenants')?.body).toEqual({ name: 'Новый Транс', login: 'newtrans', password: 'Secret-pass-42', proxy: 'socks5://user:pw@1.2.3.4:1080' })
    await done.getByRole('button', { name: 'Скопировать всё' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Кабинет: Новый Транс\nЛогин: newtrans\nПароль: Secret-pass-42')
    await page.screenshot({ path: `e2e-results/created-${width}.png` })
    await done.getByRole('button', { name: 'Готово' }).click()
    await expect(page.locator('main').getByText('Новый Транс').locator('visible=true')).toBeVisible()
    await context.close()
  })

  test(`блокировка — только после подтверждения · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/platform')
    const sheet = await openTenant(page, width, 'Логистик Плюс')
    await sheet.getByRole('button', { name: 'Заблокировать' }).click()
    const confirm = page.getByRole('dialog', { name: 'Заблокировать «Логистик Плюс»?' })
    await expect(confirm).toContainText('пользователи кабинета не смогут войти')
    await confirm.getByRole('button', { name: 'Отмена' }).click()
    expect(fake.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)

    await sheet.getByRole('button', { name: 'Заблокировать' }).click()
    await page.getByRole('dialog', { name: 'Заблокировать «Логистик Плюс»?' }).getByRole('button', { name: 'Заблокировать' }).click()
    await expect(sheet.getByText('Заблокирован', { exact: true })).toBeVisible()
    expect(fake.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/tenants/2', body: { status: 'BLOCKED' } })
    await expect(sheet.getByRole('button', { name: 'Войти в кабинет' })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Разблокировать' })).toBeVisible()
    await context.close()
  })

  test(`удаление — только после ввода названия · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/platform')
    const legacy = await openTenant(page, width, 'Кабинет 1')
    await expect(legacy.getByRole('button', { name: 'Заблокировать' })).toBeVisible()
    await expect(legacy.getByRole('button', { name: 'Удалить', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/platform$/)

    const sheet = await openTenant(page, width, 'Логистик Плюс')
    await sheet.getByRole('button', { name: 'Удалить', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Удалить «Логистик Плюс»?' })
    const submit = dialog.getByRole('button', { name: 'Удалить навсегда' })
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Введите название кабинета для подтверждения').fill('Логистик')
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Введите название кабинета для подтверждения').fill('Логистик Плюс')
    await submit.click()
    await expect(page).toHaveURL(/\/platform$/)
    expect(fake.calls.find((c) => c.path === '/tenants/2/delete')?.body).toEqual({ confirmName: 'Логистик Плюс' })
    await expect(page.getByText('Логистик Плюс', { exact: true })).toHaveCount(0)
    await context.close()
  })

  test(`прокси и пользователи в карточке кабинета · ${width}`, async ({ browser }) => {
    const { context, page, fake } = await open(browser, width, 'SUPERADMIN')
    await page.goto('/platform')
    const sheet = await openTenant(page, width, 'Без прокси ТОО')
    await expect(sheet).toContainText('не задан — номер не подключится')
    const field = sheet.getByLabel('Задать прокси')
    await field.fill('socks5://host')
    await expect(sheet).toContainText('Формат: socks5://')
    await expect(sheet.getByRole('button', { name: 'Сохранить' }).last()).toBeDisabled()
    await field.fill('socks5://u:p@new-host:1080')
    await sheet.getByRole('button', { name: 'Сохранить' }).last().click()
    await expect(sheet.getByText('socks5://new-host:1080')).toBeVisible()
    expect(fake.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ proxy: 'socks5://u:p@new-host:1080' })
    await sheet.getByRole('button', { name: 'Проверить' }).click()
    await expect(sheet.getByRole('status')).toHaveText('Прокси работает, WhatsApp доступен: IP 203.0.113.7 · KZ, Almaty · Tele2')
    await sheet.getByRole('button', { name: 'Убрать' }).click()
    await page.getByRole('dialog', { name: 'Убрать прокси?' }).getByRole('button', { name: 'Убрать' }).click()
    await expect(sheet).toContainText('не задан — номер не подключится')
    expect(fake.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ proxy: null })

    await sheet.getByRole('button', { name: 'Действия: logist' }).click()
    await page.getByRole('menuitem', { name: 'Сбросить пароль' }).click()
    const reset = page.getByRole('dialog', { name: 'Новый пароль для logist' })
    await reset.getByRole('button', { name: 'Сменить пароль' }).click()
    const done = page.getByRole('dialog', { name: 'Пароль изменён' })
    await expect(done.getByLabel('Логин', { exact: true })).toHaveText('logist')
    const patch = fake.calls.filter((c) => c.method === 'PATCH').at(-1)
    expect(patch?.path).toBe('/users/21')
    await expect(done.getByLabel('Пароль', { exact: true })).toHaveText((patch?.body as { password: string }).password)
    await done.getByRole('button', { name: 'Готово' }).click()

    await sheet.getByRole('button', { name: 'Добавить' }).click()
    const add = page.getByRole('dialog', { name: 'Новый пользователь' })
    await add.getByLabel('Логин').fill('driver')
    await add.getByRole('button', { name: 'Создать' }).click()
    await expect(page.getByRole('dialog', { name: 'Пользователь создан' })).toContainText('driver')
    await page.getByRole('button', { name: 'Готово' }).click()
    await page.screenshot({ path: `e2e-results/tenant-${width}.png` })
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await context.close()
  })

  test(`смена пароля: проверки и ошибка сервера · ${width}`, async ({ browser }) => {
    const { context, page } = await open(browser, width, 'MEMBER')
    const bodies: unknown[] = []
    await page.route('**/api/auth/password', async (route) => {
      bodies.push(route.request().postDataJSON())
      const wrong = bodies.length === 1
      await route.fulfill(wrong ? { status: 400, json: { message: 'Текущий пароль неверный' } } : { status: 204 })
    })
    await page.goto('/settings')
    const card = page.locator('form').filter({ has: page.getByLabel('Текущий пароль') })
    const submit = card.getByRole('button', { name: 'Сменить пароль' })
    await submit.click()
    await expect(card).toContainText('Введите текущий пароль')
    await expect(card).toContainText('Не короче 8 символов')
    await card.getByLabel('Текущий пароль').fill('old-pass-1')
    await card.getByRole('textbox', { name: /^Новый пароль/ }).fill('new-pass-1')
    await card.getByLabel('Повторите новый пароль').fill('new-pass-2')
    await submit.click()
    await expect(card).toContainText('Пароли не совпадают')
    expect(bodies).toHaveLength(0)
    await card.getByLabel('Повторите новый пароль').fill('new-pass-1')
    await submit.click()
    await expect(card.getByRole('alert')).toHaveText('Текущий пароль неверный')
    await expect(page).toHaveURL(/\/settings$/)
    await submit.click()
    await expect(page.getByText('Пароль изменён')).toBeVisible()
    await expect(card.getByLabel('Текущий пароль')).toHaveValue('')
    expect(bodies.at(-1)).toEqual({ current: 'old-pass-1', next: 'new-pass-1' })
    await context.close()
  })
}

async function expectDialogFits(page: Page) {
  const viewport = page.viewportSize()!
  const box = await page.getByRole('dialog').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5)
}
