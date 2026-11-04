import { describe, expect, it } from 'vitest'
import { fitsPhoneRow, PHONE_ROW_MAX_CHARS, PHONE_ROW_MAX_OPTIONS } from './segmented-layout'

const option = (label: string, count?: number) => ({ value: label, label, count })

describe('fitsPhoneRow', () => {
  it('keeps short options in one row', () => {
    expect(fitsPhoneRow([option('Все группы', 140), option('Список'), option('Выбрать')])).toBe(true)
    expect(fitsPhoneRow([option('Сегодня'), option('7 дней'), option('30 дней')])).toBe(true)
  })

  it('moves long labels with counters to a grid', () => {
    expect(fitsPhoneRow([option('Все', 140), option('В рассылке', 120), option('Не в рассылке', 20)])).toBe(false)
    expect(fitsPhoneRow([option('x'.repeat(PHONE_ROW_MAX_CHARS + 1))])).toBe(false)
  })

  it('moves many options to a grid', () => {
    expect(fitsPhoneRow(Array.from({ length: PHONE_ROW_MAX_OPTIONS + 1 }, (_, i) => option(String(i))))).toBe(false)
  })
})
