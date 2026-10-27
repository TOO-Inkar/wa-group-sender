import { describe, expect, it } from 'vitest'
import type { TenantOverview } from './api'
import { accountErrors, auditActionText, generatePassword, GENERATED_PASSWORD_LENGTH, matchesTenant, proxyError, proxyState } from './model'

const tenant = (patch: Partial<TenantOverview>): TenantOverview => ({
  id: 2,
  name: 'Логистик Плюс',
  status: 'ACTIVE',
  legacy: false,
  createdAt: '2026-10-01T10:00:00Z',
  users: 1,
  session: 'CONNECTED',
  account: '77001234567',
  dispatcher: 'idle',
  activeGroups: 10,
  sentToday: 0,
  sentLastHour: 0,
  queueLength: 0,
  stoppedByRisk: false,
  proxy: 'socks5://10.0.0.1:1080',
  proxyRequired: true,
  ...patch,
})

describe('генератор пароля', () => {
  it('нужной длины, без похожих символов и каждый раз новый', () => {
    const a = generatePassword()
    expect(a).toHaveLength(GENERATED_PASSWORD_LENGTH)
    expect(a).toMatch(/^[a-zA-Z2-9]+$/)
    expect(a).not.toMatch(/[01lIoO]/)
    expect(generatePassword()).not.toBe(a)
  })
})

describe('проверка учётки', () => {
  it('проверяет только переданные поля', () => {
    expect(accountErrors({ name: '', login: '', password: 'short', proxy: '' }, ['password'])).toEqual({ password: 'Не короче 8 символов' })
    expect(accountErrors({ name: ' ', login: 'a b', password: '12345678', proxy: 'proxy.kz' }, ['name', 'login', 'password', 'proxy'])).toEqual({ name: 'Введите название', login: 'Без пробелов', proxy: 'Формат: socks5://логин:пароль@хост:порт (или http://, https://)' })
    expect(accountErrors({ name: 'Кабинет', login: 'ivan', password: '12345678', proxy: '' }, ['name', 'login', 'password', 'proxy'])).toEqual({})
  })
})

describe('фильтр кабинетов', () => {
  it('по статусу, названию, номеру и id', () => {
    const blocked = tenant({ id: 3, status: 'BLOCKED', name: 'Стоп' })
    expect(matchesTenant(tenant({}), 'blocked', '')).toBe(false)
    expect(matchesTenant(blocked, 'blocked', '')).toBe(true)
    expect(matchesTenant(tenant({}), 'all', 'плюс')).toBe(true)
    expect(matchesTenant(tenant({}), 'all', '7700')).toBe(true)
    expect(matchesTenant(blocked, 'all', '3')).toBe(true)
    expect(matchesTenant(tenant({}), 'active', 'нет такого')).toBe(false)
  })
})

describe('журнал', () => {
  it('понятные названия действий, неизвестные — как есть', () => {
    expect(auditActionText('ENTER')).toBe('Вход в кабинет')
    expect(auditActionText('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

describe('прокси', () => {
  it('принимает socks5/http/https с логином или без, пустое — можно', () => {
    expect(proxyError('')).toBeUndefined()
    expect(proxyError('socks5://user:p%40ss@1.2.3.4:1080')).toBeUndefined()
    expect(proxyError('http://proxy.kz:3128')).toBeUndefined()
    expect(proxyError('https://u@proxy.kz:443/')).toBeUndefined()
    expect(proxyError('ftp://proxy.kz:21')).toBeDefined()
    expect(proxyError('socks5://proxy.kz')).toBeDefined()
  })

  it('без прокси — предупреждение, у основного кабинета — прямое подключение', () => {
    expect(proxyState(tenant({}))).toBeNull()
    expect(proxyState(tenant({ proxy: null }))).toEqual({ text: 'Без прокси', tone: 'warn' })
    expect(proxyState(tenant({ proxy: null, legacy: true }))).toEqual({ text: 'Прямое подключение', tone: 'neutral' })
    expect(proxyState(tenant({ proxy: null, proxyRequired: false }))).toEqual({ text: 'Прямое подключение', tone: 'neutral' })
  })
})
