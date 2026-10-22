export const ZONE = 'Asia/Almaty'

/** 1 группа, 2 группы, 5 групп. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many
  return `${n} ${word}`
}

/** «22.10, 13:00» в часовом поясе сервиса. */
export function formatTime(value: string | number | null | undefined): string {
  if (value == null) return ''
  const ms = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleString('ru-RU', {
    timeZone: ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Дата в часовом поясе сервиса в виде 2026-10-05. */
export function isoDay(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: ZONE })
}

/** «каждый час», «каждые 2 часа», «каждые 1,5 часа». */
export function intervalText(minutes: number | null | undefined): string {
  if (!minutes) return ''
  if (minutes % 60 === 0) return minutes === 60 ? 'каждый час' : `каждые ${plural(minutes / 60, 'час', 'часа', 'часов')}`
  return `каждые ${String(minutes / 60).replace('.', ',')} часа`
}
