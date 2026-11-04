import type { Page, Route } from '@playwright/test'

export const ENTER_URL = '/api/auth/enter?code=e2e-code'

export type Role = 'SUPERADMIN' | 'MEMBER'
type Tenant = Record<string, unknown> & { id: number; name: string; status: string; proxy: string | null }
type Call = { method: string; path: string; body: unknown }

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

export function platform() {
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


export async function mockPlatform(page: Page, role: Role = 'SUPERADMIN') {
  const fake = platform()
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { authenticated: true, username: role === 'SUPERADMIN' ? 'owner' : 'logist', role, tenant: { id: 1, name: 'Кабинет 1' } } }),
  )
  await page.route('**/api/platform/**', fake.handle)
  return fake
}
