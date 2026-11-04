import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { useHealth } from '@/features/health/api'
import { SESSION_TEXT } from '@/features/health/texts'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
import { buttonVariants } from '@/shared/ui/styles'

export function ConnectionPanel() {
  const { data: health } = useHealth()
  const connected = health?.session === 'CONNECTED'
  const qr = useQuery({
    queryKey: ['qr'],
    queryFn: async () => {
      const response = await fetch('/api/qr', { credentials: 'same-origin' })
      return response.ok ? URL.createObjectURL(await response.blob()) : null
    },
    enabled: !!health && !connected,
    refetchInterval: 3000,
  })
  useEffect(() => () => {
    if (qr.data) URL.revokeObjectURL(qr.data)
  }, [qr.data])

  return (
    <Card className={cn('grid items-start gap-4', !connected && 'md:grid-cols-[auto_minmax(0,1fr)] md:gap-6')}>
      {connected ? (
        <span className="justify-self-start">
          <Badge tone="ok">Номер привязан</Badge>
        </span>
      ) : (
        <div className="grid size-[300px] max-w-full place-items-center rounded-lg border border-border bg-white p-3 text-center text-[#5c6670]">
          {qr.data ? <img alt="QR для привязки" src={qr.data} className="size-full [image-rendering:pixelated]" /> : health?.session === 'BANNED' ? 'Номер заблокирован' : 'Ждём QR от WhatsApp…'}
        </div>
      )}
      <div className="grid gap-3 text-sm">
        {connected ? (
          <>
            <p>
              WhatsApp подключён. Групп в рассылке: <b>{health.activeGroups}</b>.
            </p>
            <p className="text-muted">Если на телефоне поменялся состав «Архива», обновите список групп.</p>
            <Link to="/groups" className={buttonVariants({ className: 'justify-self-start' })}>
              Открыть группы
            </Link>
          </>
        ) : (
          <>
            <p>Состояние: {SESSION_TEXT[health?.session ?? ''] ?? '…'}.</p>
            <ol className="grid list-decimal gap-1.5 pl-5">
              <li>На телефоне с номером рассылки: WhatsApp → Настройки → Связанные устройства.</li>
              <li>«Привязка устройства» → наведите камеру на QR.</li>
              <li>QR меняется примерно раз в 20 секунд — страница подхватит новый сама.</li>
            </ol>
            <p className="text-muted">Перед привязкой включите «Оставлять чаты в архиве» и положите нужные группы в «Архив».</p>
          </>
        )}
      </div>
    </Card>
  )
}
