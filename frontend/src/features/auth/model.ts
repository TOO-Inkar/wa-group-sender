export type Role = 'SUPERADMIN' | 'MEMBER'

export type Me = {
  authenticated: boolean
  username: string | null
  role: Role | null
  tenant: { id: number; name: string } | null
}

export const SIGNED_OUT: Me = { authenticated: false, username: null, role: null, tenant: null }

export const MIN_PASSWORD = 8

const ADMIN_HOST_PREFIX = 'admin.'

export const PLATFORM_PATH = '/platform'
export const TENANT_HOME = '/campaigns'

export const isSuperadmin = (me: Me | undefined) => me?.authenticated === true && me.role === 'SUPERADMIN'

export const isAdminHost = (hostname: string) => hostname.startsWith(ADMIN_HOST_PREFIX)

export function homePath(me: Me | undefined, hostname: string): string {
  return isSuperadmin(me) && isAdminHost(hostname) ? PLATFORM_PATH : TENANT_HOME
}

export function adminAreaUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  const host = isAdminHost(location.host) ? location.host : ADMIN_HOST_PREFIX + location.host.replace(/^www\./, '')
  return `${location.protocol}//${host}${PLATFORM_PATH}`
}

export type PasswordChange = { current: string; next: string; repeat: string }

export function passwordChangeErrors(v: PasswordChange): Partial<Record<keyof PasswordChange, string>> {
  const errors: Partial<Record<keyof PasswordChange, string>> = {}
  if (!v.current) errors.current = 'Введите текущий пароль'
  if (v.next.length < MIN_PASSWORD) errors.next = `Не короче ${MIN_PASSWORD} символов`
  else if (v.next === v.current) errors.next = 'Совпадает с текущим'
  if (!errors.next && v.repeat !== v.next) errors.repeat = 'Пароли не совпадают'
  return errors
}
