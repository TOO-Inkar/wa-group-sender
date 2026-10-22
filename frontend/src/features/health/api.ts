import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'

export const healthKeys = { all: ['health'] as const }

/** Состояние сессии и рассылки; обновляется раз в 5 секунд, пока страница открыта. */
export function useHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: () => unwrap(api.GET('/api/admin/health')),
    refetchInterval: 5000,
  })
}
