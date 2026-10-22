import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const UNAUTHORIZED_EVENT = 'wa:unauthorized'

const unauthorized: Middleware = {
  onResponse({ response }) {
    if (response.status === 401 && !response.url.endsWith('/api/auth/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
  },
}

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(unauthorized)

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

// openapi-fetch разбирает text/plain как JSON.
export const asText = { parseAs: 'text' as const }
