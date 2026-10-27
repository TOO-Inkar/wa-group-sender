import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'

const groupKeys = {
  all: ['groups'] as const,
  lists: ['group-lists'] as const,
}

export function useGroups() {
  return useQuery({ queryKey: groupKeys.all, queryFn: () => unwrap(api.GET('/api/groups')) })
}

export function useGroupLists() {
  return useQuery({ queryKey: groupKeys.lists, queryFn: () => unwrap(api.GET('/api/admin/group-lists')) })
}

export function useSyncGroups() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/admin/groups/sync')),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.all }),
  })
}

export function useResetRejections() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (jid: string) => unwrap(api.POST('/api/admin/groups/reset-rejections', { params: { query: { jid } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.all }),
  })
}

export function useSaveGroupList() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; groups: string[] }) => unwrap(api.PUT('/api/admin/group-lists', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.lists }),
  })
}

export function useUpdateGroupList() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; groups: string[] }) => unwrap(api.PUT('/api/admin/group-lists/{id}', { params: { path: { id } }, body })),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: groupKeys.lists }), client.invalidateQueries({ queryKey: ['campaigns'] })]),
  })
}

export function useDeleteGroupList() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/admin/group-lists/{id}', { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.lists }),
  })
}
