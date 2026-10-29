import { Ban, Pencil, Play, Send, Trash2 } from 'lucide-react'
import { useCampaign } from '../api'
import { useCampaignCommands } from '../commands'
import { campaignState, scheduleText, STATE, whereText } from '../model'
import { RunPanel } from './RunPanel'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { WhatsAppBubble } from '@/shared/ui/whatsapp-bubble'
import { Sheet } from '@/shared/ui/sheet'

export function CampaignSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c, isPending, isError } = useCampaign(id)
  const cmd = useCampaignCommands()

  if (isPending || isError || !c) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()} title={`№${id}`}>
        <p className="text-sm text-muted">{isPending ? 'Загрузка…' : 'Заявка не найдена или удалена.'}</p>
      </Sheet>
    )
  }
  const state = STATE[campaignState(c)]

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      width="max-w-5xl"
      title={
        <span className="flex items-center gap-2.5">
          <Badge tone={state.tone}>{state.text}</Badge>
          <span className="line-clamp-2 [overflow-wrap:anywhere]">
            №{c.id} · {c.title}
          </span>
        </span>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => cmd.edit(c)}>
            <Pencil size={14} /> Изменить
          </Button>
          <Button size="sm" disabled={!!c.current || cmd.busy} onClick={() => cmd.sendNow(c)} title={c.current ? 'Рассылка ещё идёт' : undefined}>
            <Send size={14} /> Отправить сейчас
          </Button>
          {c.enabled || c.current ? (
            <Button size="sm" disabled={cmd.busy} onClick={() => cmd.disable(c)}>
              <Ban size={14} /> Выключить
            </Button>
          ) : (
            c.repeatMode !== 'ONCE' && (
              <Button size="sm" disabled={cmd.busy} onClick={() => cmd.enable(c)}>
                <Play size={14} /> Включить расписание
              </Button>
            )
          )}
          <Button size="sm" variant="danger" disabled={cmd.busy} onClick={() => cmd.remove(c)}>
            <Trash2 size={14} /> Удалить
          </Button>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-3">
            <WhatsAppBubble text={c.message} className="max-h-[46vh] overflow-auto" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Кому</dt>
              <dd>
                {c.targeted ? (
                  <details>
                    <summary className="cursor-pointer">
                      {whereText(c)} · {c.targets.length}
                    </summary>
                    <ul className="mt-1 max-h-40 overflow-auto text-[13px] text-muted">
                      {c.targets.map((t) => (
                        <li key={t.jid} className="truncate">
                          {t.name}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  'все группы в рассылке'
                )}
              </dd>
              <dt className="text-muted">Когда</dt>
              <dd>{scheduleText(c)}</dd>
              {c.enabled && c.nextRunAt && (
                <>
                  <dt className="text-muted">Следующая</dt>
                  <dd className="tabular-nums">{formatTime(c.nextRunAt)}</dd>
                </>
              )}
              <dt className="text-muted">Создана</dt>
              <dd className="tabular-nums">{formatTime(c.createdAt)}</dd>
            </dl>
          </div>
          <RunPanel key={c.runs[0]?.id ?? 'none'} runs={c.runs} />
        </div>
      </div>
    </Sheet>
  )
}
