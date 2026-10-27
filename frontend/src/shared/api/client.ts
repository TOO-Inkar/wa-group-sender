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

const CREDENTIAL_CHECKS = ['/api/auth/login', '/api/auth/password']

function reportUnauthorized(response: Response) {
  if (response.status === 401 && !CREDENTIAL_CHECKS.some((path) => response.url.endsWith(path))) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
}

const unauthorized: Middleware = {
  onResponse({ response }) {
    reportUnauthorized(response)
  },
}

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(unauthorized)

function apiError(status: number, error: unknown): ApiError {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : status === 401
        ? 'Нужно войти заново'
        : `Ошибка сервера (HTTP ${status})`
  return new ApiError(status, message)
}

export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok) throw apiError(response.status, error)
  return data as T
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

export async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  reportUnauthorized(response)
  const data = parseJson(await response.text())
  if (!response.ok) throw apiError(response.status, data)
  return data as T
}

// openapi-fetch разбирает text/plain как JSON.
export const asText = { parseAs: 'text' as const }
