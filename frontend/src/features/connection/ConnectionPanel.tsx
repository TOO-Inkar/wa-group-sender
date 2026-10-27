import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { useHealth } from '@/features/health/api'
import { SESSION_TEXT } from '@/features/health/texts'
import { Card } from '@/shared/ui/card'

export function ConnectionPanel() {
  const { data: health } = useHealth()
  const connected = health?.session === 'CONNECTED'
  const qr = useQuery({
    queryKey: ['qr'],
    queryFn: async () => {
      const response = await fetch('/api/qr', { credentials: 'same-origin' })
      return response.ok ? URL.createObjectURL(await response.blob()) : null
    },
    enabled: !connected,
    refetchInterval: 3000,
  })
  useEffect(() => () => {
    if (qr.data) URL.revokeObjectURL(qr.data)
  }, [qr.data])

  return (
    <Card className="grid items-start gap-6 p-5 md:grid-cols-[auto_minmax(0,1fr)]">
      <div className={`grid max-w-full place-items-center rounded-xl border border-border p-3.5 text-center ${connected ? 'w-full bg-ok-bg py-6 font-semibold text-ok-text md:size-[300px]' : 'size-[300px] bg-white text-[#64707f]'}`}>
        {connected ? 'Номер привязан' : qr.data ? <img alt="QR для привязки" src={qr.data} className="size-full [image-rendering:pixelated]" /> : health?.session === 'BANNED' ? 'Номер заблокирован' : 'Ждём QR от WhatsApp…'}
      </div>
      <div className="grid gap-3 text-sm">
        {connected ? (
          <>
            <p>
              WhatsApp подключён. Групп в рассылке: <b>{health.activeGroups}</b>.
            </p>
            <p className="text-muted">Если на телефоне поменялся состав «Архива», обновите список групп.</p>
            <Link to="/groups" className="justify-self-start rounded-lg border border-border px-3.5 py-2 font-medium hover:bg-surface-2">
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
