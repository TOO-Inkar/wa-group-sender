import { Navigate } from 'react-router'
import { useMe } from '@/features/auth/api'
import { homePath } from '@/features/auth/model'
import { LoginForm } from '@/features/auth/LoginForm'
import { Card } from '@/shared/ui/card'
import { Logo } from '@/shared/ui/logo'

export function LoginPage() {
  const { data: me } = useMe()
  if (me?.authenticated) return <Navigate to={homePath(me, window.location.hostname)} replace />
  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <div className="grid w-full max-w-[380px] gap-5">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
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
