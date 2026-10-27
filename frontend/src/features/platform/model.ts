import type { AuditAction, TenantOverview } from './api'
import { MIN_PASSWORD } from '@/features/auth/model'
import { plural } from '@/shared/lib/format'

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const GENERATED_PASSWORD_LENGTH = 14
const MAX_LOGIN = 64
const MAX_NAME = 100

export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('')
}

const PROXY_PATTERN = /^(socks5|https?):\/\/([^\s:@/]+(:[^\s@/]*)?@)?[^\s:@/]+:\d{1,5}\/?$/i
export const PROXY_PLACEHOLDER = 'socks5://логин:пароль@хост:порт'

export function proxyError(value: string): string | undefined {
  const v = value.trim()
  return v && !PROXY_PATTERN.test(v) ? 'Формат: socks5://логин:пароль@хост:порт (или http://, https://)' : undefined
}

export type ProxyState = { text: string; tone: 'warn' | 'neutral' } | null

export function proxyState(t: Pick<TenantOverview, 'proxy' | 'proxyRequired' | 'legacy'>): ProxyState {
  if (t.proxy) return null
  return t.proxyRequired && !t.legacy ? { text: 'Без прокси', tone: 'warn' } : { text: 'Прямое подключение', tone: 'neutral' }
}

export type Account = { name: string; login: string; password: string; proxy: string }
export type AccountField = keyof Account

export function accountErrors(v: Account, fields: AccountField[]): Partial<Record<AccountField, string>> {
  const errors: Partial<Record<AccountField, string>> = {}
  if (fields.includes('name')) {
    if (!v.name.trim()) errors.name = 'Введите название'
    else if (v.name.trim().length > MAX_NAME) errors.name = `Не длиннее ${MAX_NAME} символов`
  }
  if (fields.includes('login')) {
    if (!v.login.trim()) errors.login = 'Введите логин'
    else if (/\s/.test(v.login.trim())) errors.login = 'Без пробелов'
    else if (v.login.trim().length > MAX_LOGIN) errors.login = `Не длиннее ${MAX_LOGIN} символов`
  }
  if (fields.includes('password') && v.password.length < MIN_PASSWORD) errors.password = `Не короче ${MIN_PASSWORD} символов`
  const proxy = fields.includes('proxy') ? proxyError(v.proxy) : undefined
  if (proxy) errors.proxy = proxy
  return errors
}

export type TenantFilter = 'all' | 'active' | 'blocked'

export function matchesTenant(t: TenantOverview, filter: TenantFilter, query: string): boolean {
  if (filter === 'active' && t.status !== 'ACTIVE') return false
  if (filter === 'blocked' && t.status !== 'BLOCKED') return false
  const q = query.trim().toLowerCase()
  return !q || t.name.toLowerCase().includes(q) || (t.account ?? '').toLowerCase().includes(q) || String(t.id) === q
}

export const isBlocked = (t: TenantOverview) => t.status === 'BLOCKED'

export const usersCount = (n: number) => plural(n, 'пользователь', 'пользователя', 'пользователей')

export const AUDIT_ACTION: Record<AuditAction, string> = {
  LOGIN: 'Вход',
  LOGIN_FAILED: 'Неудачный вход',
  ENTER: 'Вход в кабинет',
  TENANT_CREATED: 'Кабинет создан',
  TENANT_RENAMED: 'Кабинет переименован',
  TENANT_BLOCKED: 'Кабинет заблокирован',
  TENANT_UNBLOCKED: 'Кабинет разблокирован',
  TENANT_DELETED: 'Кабинет удалён',
  USER_CREATED: 'Пользователь создан',
  USER_UPDATED: 'Пользователь изменён',
  USER_DELETED: 'Пользователь удалён',
  PASSWORD_CHANGED: 'Пароль изменён',
  PROXY_CHANGED: 'Прокси изменён',
}

export const auditActionText = (action: string) => AUDIT_ACTION[action as AuditAction] ?? action

export const ALERT_ACTIONS: ReadonlySet<string> = new Set<AuditAction>(['LOGIN_FAILED', 'TENANT_BLOCKED', 'TENANT_DELETED', 'USER_DELETED'])
