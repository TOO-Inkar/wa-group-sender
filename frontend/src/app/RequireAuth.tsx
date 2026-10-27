import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { authKeys, useMe } from '@/features/auth/api'
import { SIGNED_OUT, TENANT_HOME, type Role } from '@/features/auth/model'
import { UNAUTHORIZED_EVENT } from '@/shared/api/client'

export function RequireAuth({ role }: { role?: Role }) {
  const { data: me, isPending } = useMe()
  const client = useQueryClient()
  const location = useLocation()

  useEffect(() => {
    const onUnauthorized = () => client.setQueryData(authKeys.me, SIGNED_OUT)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [client])

  if (isPending) return null
  if (!me?.authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (role && me.role !== role) return <Navigate to={TENANT_HOME} replace />
  return <Outlet />
}
