import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/shared/api/client'

export const authKeys = { me: ['auth', 'me'] as const }

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => unwrap(api.GET('/api/auth/me')),
    staleTime: Infinity,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => unwrap(api.POST('/api/auth/login', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      client.setQueryData(authKeys.me, { authenticated: false })
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== authKeys.me[0] })
    },
  })
}
