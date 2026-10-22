import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { authKeys, useMe } from '@/features/auth/api'
import { UNAUTHORIZED_EVENT } from '@/shared/api/client'

/** Внутренние страницы — только после входа. Ответ 401 от любого запроса возвращает на страницу входа. */
export function RequireAuth() {
  const { data: me, isPending } = useMe()
  const client = useQueryClient()
  const location = useLocation()

  useEffect(() => {
    const onUnauthorized = () => client.setQueryData(authKeys.me, { authenticated: false })
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [client])

  if (isPending) return null
  if (!me?.authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
