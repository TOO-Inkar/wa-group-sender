import { Navigate } from 'react-router'
import { useMe } from '@/features/auth/api'
import { LoginForm } from '@/features/auth/LoginForm'
import { Card } from '@/shared/ui/card'

export function LoginPage() {
  const { data: me } = useMe()
  if (me?.authenticated) return <Navigate to="/campaigns" replace />
  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <div className="grid w-full max-w-[380px] gap-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-text">W</div>
          <div className="leading-tight">
            <div className="font-semibold">wa-group-sender</div>
            <div className="text-[13px] text-muted">Рассылка заявок в группы WhatsApp</div>
          </div>
        </div>
        <Card className="grid gap-5 p-7">
          <h1 className="text-2xl font-semibold">Вход</h1>
          <LoginForm />
        </Card>
      </div>
    </div>
  )
}
