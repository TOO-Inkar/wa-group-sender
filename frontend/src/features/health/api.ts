import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'

export const healthKeys = { all: ['health'] as const }

export function useHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: () => unwrap(api.GET('/api/admin/health')),
    refetchInterval: 5000,
  })
}
