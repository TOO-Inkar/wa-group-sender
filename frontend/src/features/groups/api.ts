import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'
import type { Group } from '@/shared/api/types'

export const groupKeys = {
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

export function useDeleteGroupList() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/admin/group-lists/{id}', { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.lists }),
  })
}

/** Отметить можно только группу, куда номер может писать; архив для этого не обязателен. */
export function sendable(group: Group): boolean {
  return group.member === true && group.canSend === true && !group.community && !group.tooLarge && !group.rejected
}

export function matches(group: Group, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || (group.name ?? '').toLowerCase().includes(q)
}

export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => Number(!a.name) - Number(!b.name) || (a.name ?? a.jid).localeCompare(b.name ?? b.jid, 'ru'))
}
