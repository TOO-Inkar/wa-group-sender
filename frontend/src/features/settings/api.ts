import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { healthKeys } from '@/features/health/api'
import { api, unwrap } from '@/shared/api/client'
import type { Settings } from '@/shared/api/types'

export const settingsKeys = { all: ['settings'] as const }

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: () => unwrap(api.GET('/api/admin/settings')) })
}

/** Меняет только переданные поля. */
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

export function windowText(s: Settings): string {
  const hours = s.windowStart === s.windowEnd ? 'круглосуточно' : `${s.windowStart}–${s.windowEnd}`
  return `${hours}, ${s.weekendsEnabled ? 'ежедневно' : 'по будням'}`
}
