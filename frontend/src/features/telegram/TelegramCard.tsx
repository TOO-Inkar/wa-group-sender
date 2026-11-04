import { toast } from 'sonner'
import { useSubscriberAction, useTelegram, useTestAlert } from './api'
import { CardNote, SettingsCard } from '@/features/settings/SettingsCard'
import { formatTime, plural } from '@/shared/lib/format'
import { Badge, type Tone } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { CopyButton } from '@/shared/ui/copy-button'

const STATUS: Record<string, { text: string; tone: Tone }> = {
  PENDING: { text: 'ждёт одобрения', tone: 'warn' },
  APPROVED: { text: 'получает', tone: 'ok' },
  REJECTED: { text: 'отклонён', tone: 'bad' },
}

function Person({ name, username, note }: { name: string | null; username: string | null; note: string }) {
  return (
    <span className="min-w-0 flex-1 basis-40 text-sm break-words">
      <span className="font-medium">{name ?? 'без имени'}</span>
      {username && <span className="text-muted"> @{username}</span>}
      <span className="block text-caption text-muted">{note}</span>
    </span>
  )
}

export function TelegramCard() {
  const { data } = useTelegram()
  const action = useSubscriberAction()
  const test = useTestAlert()
  const confirm = useConfirm()
  const title = 'Уведомления в Telegram'
  if (!data) return <SettingsCard title={title} />
  const row = 'flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0'

  return (
    <SettingsCard
      title={title}
      actions={
        <Button
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
      }
    >
      <CardNote>
        {data.botConfigured && data.inviteLink ? (
          <>Чтобы получать уведомления этого кабинета, откройте ссылку в Telegram, нажмите «Старт» и одобрите запрос здесь. Отписаться — <code>/stop</code>.</>
        ) : data.botConfigured ? (
          <>
            Чтобы получать уведомления, напишите боту {data.botUsername && <b>@{data.botUsername}</b>} <code>/start</code> и одобрите запрос здесь. Отписаться — <code>/stop</code>.
          </>
        ) : (
          'Бот не настроен: нужен TELEGRAM_BOT_TOKEN в .env на сервере.'
        )}
      </CardNote>
      {data.inviteLink && (
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-surface-2 pl-3">
          <a href={data.inviteLink} target="_blank" rel="noreferrer" title={data.inviteLink} className="min-w-0 flex-1 truncate text-sm text-accent hover:underline" aria-label="Ссылка-приглашение в Telegram">
            {data.inviteLink}
          </a>
          <CopyButton value={data.inviteLink} label="Скопировать ссылку" className="shrink-0" />
        </div>
      )}
      <div className="grid min-w-0">
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
        {!data.configuredChats.length && !data.subscribers.length && <CardNote>Пока никто не подписан.</CardNote>}
      </div>
    </SettingsCard>
  )
}
