import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { healthKeys } from '@/features/health/api'
import { api, unwrap } from '@/shared/api/client'
import type { Settings } from '@/shared/api/types'

const settingsKeys = { all: ['settings'] as const }

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: () => unwrap(api.GET('/api/admin/settings')) })
}

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<Settings>) => unwrap(api.PUT('/api/admin/settings', { body: changes as Settings })),
    onSuccess: (saved) => {
      client.setQueryData(settingsKeys.all, saved)
      client.invalidateQueries({ queryKey: healthKeys.all })
    },
  })
}

export function useDispatchControl() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (what: 'pause' | 'resume') => unwrap(what === 'pause' ? api.POST('/api/admin/pause') : api.POST('/api/admin/resume')),
    onSuccess: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  })
}
