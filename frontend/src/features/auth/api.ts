import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SIGNED_OUT, type Me } from './model'
import { api, request, unwrap } from '@/shared/api/client'

export const authKeys = { me: ['auth', 'me'] as const }

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => request<Me>('GET', '/api/auth/me'),
    staleTime: Infinity,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => request<Me>('POST', '/api/auth/login', body),
    onSuccess: () => client.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      client.setQueryData(authKeys.me, SIGNED_OUT)
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== authKeys.me[0] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current: string; next: string }) => request<void>('POST', '/api/auth/password', body),
  })
}
