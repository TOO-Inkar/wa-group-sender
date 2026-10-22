import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'

export const telegramKeys = { all: ['telegram'] as const }

/** Получатели уведомлений; раз в минуту — чтобы новые запросы /start появились сами. */
export function useTelegram() {
  return useQuery({ queryKey: telegramKeys.all, queryFn: () => unwrap(api.GET('/api/admin/telegram')), refetchInterval: 60_000 })
}

export function useSubscriberAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ action, chatId }: { action: 'approve' | 'reject' | 'remove'; chatId: string }) => {
      const path = { params: { path: { chatId } } }
      if (action === 'approve') return unwrap(api.POST('/api/admin/telegram/subscribers/{chatId}/approve', path))
      if (action === 'reject') return unwrap(api.POST('/api/admin/telegram/subscribers/{chatId}/reject', path))
      return unwrap(api.DELETE('/api/admin/telegram/subscribers/{chatId}', path))
    },
    onSuccess: () => client.invalidateQueries({ queryKey: telegramKeys.all }),
  })
}

export function useTestAlert() {
  return useMutation({ mutationFn: () => unwrap(api.POST('/api/admin/test-alert')) as Promise<{ deliveredChats?: number }> })
}
