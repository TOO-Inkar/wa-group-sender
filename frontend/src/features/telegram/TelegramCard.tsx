import { toast } from 'sonner'
import { useSubscriberAction, useTelegram, useTestAlert } from './api'
import { formatTime, plural } from '@/shared/lib/format'
import { Badge, type Tone } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardTitle } from '@/shared/ui/card'
import { useConfirm } from '@/shared/ui/confirm'

const STATUS: Record<string, { text: string; tone: Tone }> = {
  PENDING: { text: 'ждёт одобрения', tone: 'warn' },
  APPROVED: { text: 'получает', tone: 'ok' },
  REJECTED: { text: 'отклонён', tone: 'bad' },
}

function Person({ name, username, note }: { name: string | null; username: string | null; note: string }) {
  return (
    <span className="min-w-0">
      <b>{name ?? 'без имени'}</b>
      {username && <span className="text-muted"> @{username}</span>}
      <span className="block text-xs text-muted">{note}</span>
    </span>
  )
}

/** Кто получает уведомления: из .env и подписчики бота с одобрением. */
export function TelegramCard() {
  const { data } = useTelegram()
  const action = useSubscriberAction()
  const test = useTestAlert()
  const confirm = useConfirm()
  if (!data) return <Card>Загрузка…</Card>
  const row = 'flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0'

  return (
    <Card className="grid content-start gap-3">
      <CardTitle className="mb-0">Уведомления в Telegram</CardTitle>
      <p className="text-[13px] text-muted">
        {data.botConfigured ? (
          <>
            Чтобы получать уведомления, напишите боту {data.botUsername && <b>@{data.botUsername}</b>} <code>/start</code> и одобрите запрос здесь. Отписаться — <code>/stop</code>.
          </>
        ) : (
          'Бот не настроен: нужен TELEGRAM_BOT_TOKEN в .env на сервере.'
        )}
      </p>
      <div>
        {data.configuredChats.map((c) => (
          <div key={c.chatId} className={row}>
            <Person name={c.name ?? `чат ${c.chatId}`} username={c.username} note="задан в настройках сервера (.env)" />
            <Badge tone="ok">получает</Badge>
          </div>
        ))}
        {data.subscribers.map((s) => (
          <div key={s.chatId} className={row}>
            <Person name={s.name} username={s.username} note={`запрос ${formatTime(s.requestedAt)}`} />
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS[s.status]?.tone}>{STATUS[s.status]?.text}</Badge>
              {s.status !== 'APPROVED' && (
                <Button size="sm" variant="primary" onClick={() => action.mutate({ action: 'approve', chatId: s.chatId }, { onSuccess: () => toast.success('Подписка одобрена') })}>
                  Одобрить
                </Button>
              )}
              {s.status === 'PENDING' && (
                <Button size="sm" onClick={() => action.mutate({ action: 'reject', chatId: s.chatId })}>
                  Отклонить
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (await confirm({ title: 'Удалить подписчика?', body: <p>Уведомления перестанут приходить. Он сможет снова попросить подписку через /start.</p>, confirm: 'Удалить', danger: true }))
                    action.mutate({ action: 'remove', chatId: s.chatId })
                }}
              >
                Удалить
              </Button>
            </span>
          </div>
        ))}
        {!data.configuredChats.length && !data.subscribers.length && <p className="text-[13px] text-muted">Пока никто не подписан.</p>}
      </div>
      <Button
        className="justify-self-start"
        disabled={test.isPending}
        onClick={() =>
          test.mutate(undefined, {
            onSuccess: (r) => (r.deliveredChats ? toast.success(`Доставлено в ${plural(r.deliveredChats, 'чат', 'чата', 'чатов')}`) : toast.error('Не доставлено: нет подписчиков или бот не настроен')),
            onError: (e) => toast.error(e.message),
          })
        }
      >
        Отправить тестовое уведомление
      </Button>
    </Card>
  )
}
