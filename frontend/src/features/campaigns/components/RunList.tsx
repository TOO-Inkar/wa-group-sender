import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCampaignAction, useDeliveries } from '../api'
import { deliveryReason, progressText, RUN_STATE } from '../model'
import type { DeliveryStatus, Run } from '@/shared/api/types'
import { download } from '@/shared/lib/download'
import { formatTime } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { Badge, type Tone } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm'

const DELIVERY: Record<DeliveryStatus, { text: string; tone: Tone }> = {
  PENDING: { text: 'ждёт', tone: 'neutral' },
  SENDING: { text: 'отправляется', tone: 'info' },
  SENT: { text: 'отправлено', tone: 'ok' },
  FAILED: { text: 'ошибка', tone: 'bad' },
  SKIPPED: { text: 'пропущено', tone: 'warn' },
}

function Deliveries({ runId }: { runId: string }) {
  const { data, isPending } = useDeliveries(runId)
  if (isPending) return <p className="text-sm text-muted">Загрузка…</p>
  if (!data?.length) return <p className="text-sm text-muted">Группы ещё не распределены: рассылка не начиналась.</p>
  return (
    <div className="grid max-h-80 content-start overflow-auto">
      {data.map((d) => {
        const waiting = d.status === 'PENDING' && d.error
        const state = waiting ? { text: 'ждёт', tone: 'warn' as Tone } : DELIVERY[d.status]
        return (
          <div key={d.groupJid} className="flex items-baseline justify-between gap-2.5 border-b border-border py-1.5 last:border-b-0">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {d.groupName ?? d.groupJid}
              {d.error && <span className="block text-xs text-muted">{deliveryReason(d.error)}</span>}
            </span>
            <Badge tone={state.tone}>{state.text}</Badge>
          </div>
        )
      })}
    </div>
  )
}

/** Рассылки заявки, новые первыми; у открытой — каждая группа и отчёты. */
export function RunList({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null)
  const action = useCampaignAction()
  const confirm = useConfirm()
  if (!runs.length) return <p className="text-sm text-muted">Рассылок ещё не было.</p>

  const retry = async (run: Run) => {
    const ok = await confirm({
      title: 'Повторить в группы с ошибкой?',
      body: <p>Рассылка снова встанет в очередь и уйдёт только туда, где была ошибка. Где уже отправлено, повторно не придёт.</p>,
      confirm: 'Повторить',
    })
    if (ok) action.mutate({ action: 'retry', id: run.id }, { onSuccess: () => toast.success('Рассылка снова в очереди'), onError: (e) => toast.error(e.message) })
  }

  const report = (run: Run, format: 'xlsx' | 'pdf') =>
    download(`/api/admin/reports/requests/${encodeURIComponent(run.id)}?format=${format}`, `wa-report-${run.id}.${format}`).catch((e: Error) => toast.error(e.message))

  return (
    <div className="grid gap-1.5">
      {runs.map((run) => {
        const state = RUN_STATE[run.status]
        const isOpen = open === run.id
        return (
          <div key={run.id} className={cn('overflow-hidden rounded-xl border border-border', isOpen && 'border-accent')}>
            <button type="button" onClick={() => setOpen(isOpen ? null : run.id)} className="flex w-full cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-left hover:bg-surface-2">
              <Badge tone={state.tone}>{state.text}</Badge>
              <span className="font-semibold">{formatTime(run.queuedAt)}</span>
              <span className="text-[13px] text-muted">{progressText(run)}</span>
              <ChevronDown size={16} className={cn('ml-auto text-muted transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="grid gap-2 border-t border-border px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => report(run, 'xlsx')}>
                    Отчёт Excel
                  </Button>
                  <Button size="sm" onClick={() => report(run, 'pdf')}>
                    Отчёт PDF
                  </Button>
                  {(run.status === 'DONE' || run.status === 'FAILED') && run.progress.failed > 0 && (
                    <Button size="sm" onClick={() => retry(run)}>
                      Повторить в группы с ошибкой ({run.progress.failed})
                    </Button>
                  )}
                </div>
                <Deliveries runId={run.id} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
