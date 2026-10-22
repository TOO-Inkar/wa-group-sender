import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { healthKeys } from '@/features/health/api'
import { api, asText, unwrap } from '@/shared/api/client'
import type { CampaignForm } from '@/shared/api/types'

const REFRESH_MS = 8000

const campaignKeys = {
  all: ['campaigns'] as const,
  list: () => [...campaignKeys.all, 'list'] as const,
  detail: (id: string) => [...campaignKeys.all, 'detail', id] as const,
  deliveries: (runId: string) => ['deliveries', runId] as const,
  preview: (body: unknown) => ['preview', body] as const,
}

export function useCampaigns() {
  return useQuery({ queryKey: campaignKeys.list(), queryFn: () => unwrap(api.GET('/api/admin/campaigns')), refetchInterval: REFRESH_MS })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ''),
    queryFn: () => unwrap(api.GET('/api/admin/campaigns/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
    refetchInterval: REFRESH_MS,
  })
}

export function useDeliveries(runId: string | null) {
  return useQuery({
    queryKey: campaignKeys.deliveries(runId ?? ''),
    queryFn: () => unwrap(api.GET('/api/admin/requests/{id}/deliveries', { params: { path: { id: runId! } } })),
    enabled: !!runId,
    refetchInterval: REFRESH_MS,
  })
}

export function usePreview(body: { text?: string; items?: unknown[]; contact?: string } | null) {
  return useQuery({
    queryKey: campaignKeys.preview(body),
    queryFn: () => unwrap(api.POST('/api/admin/requests/preview', { body: body as never, ...asText })) as Promise<string>,
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

function useInvalidate() {
  const client = useQueryClient()
  return () => {
    client.invalidateQueries({ queryKey: campaignKeys.all })
    client.invalidateQueries({ queryKey: ['deliveries'] })
    client.invalidateQueries({ queryKey: healthKeys.all })
  }
}

export function useSaveCampaign(id?: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CampaignForm) =>
      id
        ? unwrap(api.PUT('/api/admin/campaigns/{id}', { params: { path: { id } }, body }))
        : unwrap(api.POST('/api/admin/campaigns', { body })),
    onSuccess: invalidate,
  })
}

type Action = 'enable' | 'disable' | 'run' | 'delete' | 'retry'

export function useCampaignAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ action, id }: { action: Action; id: string }): Promise<unknown> => {
      const path = { params: { path: { id } } }
      switch (action) {
        case 'enable':
          return unwrap(api.POST('/api/admin/campaigns/{id}/enable', path))
        case 'disable':
          return unwrap(api.POST('/api/admin/campaigns/{id}/disable', path))
        case 'run':
          return unwrap(api.POST('/api/admin/campaigns/{id}/run', path))
        case 'delete':
          return unwrap(api.DELETE('/api/admin/campaigns/{id}', path))
        case 'retry':
          return unwrap(api.POST('/api/admin/requests/{id}/retry', path))
      }
    },
    onSuccess: invalidate,
  })
}
