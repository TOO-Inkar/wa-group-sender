import { describe, expect, it } from 'vitest'
import { adminAreaUrl, homePath, passwordChangeErrors, SIGNED_OUT, type Me } from './model'

const superadmin: Me = { authenticated: true, username: 'owner', role: 'SUPERADMIN', tenant: { id: 1, name: 'Кабинет 1' } }
const member: Me = { ...superadmin, username: 'ivan', role: 'MEMBER' }

describe('стартовая страница', () => {
  it('на admin.* суперадмин попадает в админку, остальные — в кабинет', () => {
    expect(homePath(superadmin, 'admin.wa-group-sender.bid')).toBe('/platform')
    expect(homePath(superadmin, 'wa-group-sender.bid')).toBe('/campaigns')
    expect(homePath(member, 'admin.wa-group-sender.bid')).toBe('/campaigns')
    expect(homePath(SIGNED_OUT, 'admin.wa-group-sender.bid')).toBe('/campaigns')
  })

  it('адрес админки строится от текущего хоста', () => {
    expect(adminAreaUrl({ protocol: 'https:', host: 'wa-group-sender.bid' })).toBe('https://admin.wa-group-sender.bid/platform')
    expect(adminAreaUrl({ protocol: 'https:', host: 'www.example.kz' })).toBe('https://admin.example.kz/platform')
    expect(adminAreaUrl({ protocol: 'https:', host: 'admin.example.kz' })).toBe('https://admin.example.kz/platform')
  })
})

describe('смена пароля', () => {
  it('текущий обязателен, новый от 8 символов, другой и повторён', () => {
    expect(passwordChangeErrors({ current: '', next: 'short', repeat: '' })).toEqual({ current: 'Введите текущий пароль', next: 'Не короче 8 символов' })
    expect(passwordChangeErrors({ current: 'old-pass-1', next: 'old-pass-1', repeat: 'old-pass-1' })).toEqual({ next: 'Совпадает с текущим' })
    expect(passwordChangeErrors({ current: 'old-pass-1', next: 'new-pass-1', repeat: 'new-pass-2' })).toEqual({ repeat: 'Пароли не совпадают' })
    expect(passwordChangeErrors({ current: 'old-pass-1', next: 'new-pass-1', repeat: 'new-pass-1' })).toEqual({})
  })
})
