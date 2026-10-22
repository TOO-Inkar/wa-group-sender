import { Navigate } from 'react-router'
import { useMe } from '@/features/auth/api'
import { LoginForm } from '@/features/auth/LoginForm'
import { Card } from '@/shared/ui/card'

export function LoginPage() {
  const { data: me } = useMe()
  if (me?.authenticated) return <Navigate to="/campaigns" replace />
  return (
    <div className="grid min-h-full place-items-center p-4">
      <Card className="grid w-full max-w-sm gap-4 p-7">
        <div className="grid justify-items-center gap-1 text-center">
          <div className="mb-2 grid size-12 place-items-center rounded-xl bg-accent text-xl font-bold text-accent-text">W</div>
          <h1 className="text-xl font-semibold">wa-group-sender</h1>
          <p className="text-sm text-muted">Рассылка заявок в группы WhatsApp</p>
        </div>
        <LoginForm />
      </Card>
    </div>
  )
}
