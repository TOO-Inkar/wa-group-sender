import { Navigate } from 'react-router'
import { useMe } from '@/features/auth/api'
import { homePath } from '@/features/auth/model'

export function HomeRedirect() {
  const { data: me } = useMe()
  return <Navigate to={homePath(me, window.location.hostname)} replace />
}
