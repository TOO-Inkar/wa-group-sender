import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

/** Ошибка API с текстом для человека (сервер отдаёт его в поле message). */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Сессия закончилась: приложение покажет вход (см. app/RequireAuth). */
export const UNAUTHORIZED_EVENT = 'wa:unauthorized'

const unauthorized: Middleware = {
  onResponse({ response }) {
    if (response.status === 401 && !response.url.endsWith('/api/auth/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
  },
}

/** Типизированный клиент: пути, параметры и ответы берутся из OpenAPI бэкенда (schema.d.ts). */
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(unauthorized)

/** Данные ответа или исключение ApiError — для queryFn/mutationFn TanStack Query. */
export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok) {
    const message =
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : response.status === 401
          ? 'Нужно войти заново'
          : `Ошибка сервера (HTTP ${response.status})`
    throw new ApiError(response.status, message)
  }
  return data as T
}

/** Текстовые ответы (предпросмотр сообщения) openapi-fetch разбирает как JSON — их берём как текст. */
export const asText = { parseAs: 'text' as const }
