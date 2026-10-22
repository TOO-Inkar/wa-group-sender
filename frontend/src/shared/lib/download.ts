import { ApiError } from '@/shared/api/client'

/** Скачивание файла через fetch (cookie сессии уходит сама); имя — из Content-Disposition. */
export async function download(url: string, fallbackName: string): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) {
    let message = `Ошибка сервера (HTTP ${response.status})`
    try {
      message = ((await response.json()) as { message?: string }).message ?? message
    } catch {
      // не JSON
    }
    throw new ApiError(response.status, message)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = match?.[1] ? decodeURIComponent(match[1]) : fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}
