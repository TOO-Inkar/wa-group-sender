import { Ban, Pencil, Play, Send, Trash2 } from 'lucide-react'
import { useCampaign } from '../api'
import { useCampaignCommands } from '../commands'
import { campaignState, scheduleText, STATE, whereText } from '../model'
import { Recipients } from './Recipients'
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button onClick={() => cmd.edit(c)}>
            <Pencil size={15} /> Изменить
          </Button>
          <Button disabled={!!c.current || cmd.busy} onClick={() => cmd.sendNow(c)} title={c.current ? 'Рассылка ещё идёт' : undefined}>
            <Send size={15} /> Отправить сейчас
          </Button>
          {c.enabled || c.current ? (
            <Button disabled={cmd.busy} onClick={() => cmd.disable(c)}>
              <Ban size={15} /> Выключить
            </Button>
          ) : (
            c.repeatMode !== 'ONCE' && (
              <Button disabled={cmd.busy} onClick={() => cmd.enable(c)}>
                <Play size={15} /> Включить расписание
              </Button>
            )
          )}
          <Button variant="danger" className="odd:last:col-span-2" disabled={cmd.busy} onClick={() => cmd.remove(c)}>
            <Trash2 size={15} /> Удалить
          </Button>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid min-w-0 gap-4">
            <section aria-label="Сообщение">
              <WhatsAppBubble text={c.message} className="max-h-[46vh] overflow-auto" />
            </section>
            <dl aria-label="Параметры заявки" className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-y-2">
              <dt className="text-muted">Кому</dt>
              <dd className="mb-2 min-w-0 sm:mb-0">{c.targeted ? <Recipients label={whereText(c)} targets={c.targets} /> : 'все группы в рассылке'}</dd>
              <dt className="text-muted">Когда</dt>
              <dd className="mb-2 sm:mb-0">{scheduleText(c)}</dd>
              {c.enabled && c.nextRunAt && (
                <>
                  <dt className="text-muted">Следующая</dt>
                  <dd className="mb-2 tabular-nums sm:mb-0">{formatTime(c.nextRunAt)}</dd>
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
