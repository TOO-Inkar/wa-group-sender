import { Clock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCampaignAction, useDeliveries } from '../api'
import { ExportButtons, type ReportFormat } from '@/features/reports/ExportButtons'
import { deliveryReason, RUN_STATE } from '../model'
import type { Delivery, DeliveryStatus, Run } from '@/shared/api/types'
import { download } from '@/shared/lib/download'
import { formatTime } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { Badge, type Tone } from '@/shared/ui/badge'
import { toneSurface } from '@/shared/ui/tone'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Select } from '@/shared/ui/input'
import { EmptyState } from '@/shared/ui/empty-state'
import { Paged } from '@/shared/ui/paged'
import { SearchInput } from '@/shared/ui/search-input'
import { FOCUS_RING, TRANSITION } from '@/shared/ui/styles'

type Filter = 'all' | 'sent' | 'waiting' | 'failed' | 'skipped'

const GROUP_STATE: Record<DeliveryStatus, { text: string; tone: Tone }> = {
  PENDING: { text: 'ждёт', tone: 'neutral' },
  SENDING: { text: 'отправляется', tone: 'info' },
  SENT: { text: 'отправлено', tone: 'ok' },
  FAILED: { text: 'ошибка', tone: 'bad' },
  SKIPPED: { text: 'пропущено', tone: 'warn' },
}

const bucket = (d: Delivery): Exclude<Filter, 'all'> =>
  d.status === 'SENT' ? 'sent' : d.status === 'FAILED' ? 'failed' : d.status === 'SKIPPED' ? 'skipped' : 'waiting'

export function RunPanel({ runs }: { runs: Run[] }) {
  const [runId, setRunId] = useState(runs[0]?.id ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const run = runs.find((r) => r.id === runId) ?? runs[0]
  const { data: deliveries = [], isPending } = useDeliveries(run?.id ?? null)
  const action = useCampaignAction()
  const confirm = useConfirm()

  if (!run)
    return (
      <section aria-label="Результаты рассылки">
        <EmptyState>Рассылок ещё не было.</EmptyState>
      </section>
    )

  const counts = { all: deliveries.length, sent: 0, waiting: 0, failed: 0, skipped: 0 }
  deliveries.forEach((d) => counts[bucket(d)]++)
  const q = query.trim().toLowerCase()
  const shown = deliveries.filter((d) => (filter === 'all' || bucket(d) === filter) && (!q || (d.groupName ?? d.groupJid).toLowerCase().includes(q)))

  const tiles: { key: Filter; label: string; tone: string }[] = [
    { key: 'all', label: 'Всего', tone: 'text-text' },
    { key: 'sent', label: 'Отправлено', tone: 'text-ok-text' },
    { key: 'waiting', label: 'Ждёт', tone: 'text-text' },
    { key: 'failed', label: 'Ошибки', tone: 'text-bad-text' },
    { key: 'skipped', label: 'Пропущено', tone: 'text-warn-text' },
  ]

  const retry = async () => {
    if (await confirm({ title: 'Повторить в группы с ошибкой?', body: <p>Уйдёт только туда, где была ошибка.</p>, confirm: 'Повторить' }))
      action.mutate({ action: 'retry', id: run.id }, { onSuccess: () => toast.success('Рассылка снова в очереди'), onError: (e) => toast.error(e.message) })
  }
  const status = <Badge tone={RUN_STATE[run.status].tone}>{RUN_STATE[run.status].text}</Badge>
  const report = (format: ReportFormat) =>
    download(`/api/admin/reports/requests/${encodeURIComponent(run.id)}?format=${format}`, `wa-report-${run.id}.${format}`).catch((e: Error) => toast.error(e.message))

  return (
    <section aria-label="Результаты рассылки" className="grid min-w-0 gap-3">
      <div role="group" aria-label="Запуск" className="@container">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-[1_1_14rem]">
            {runs.length > 1 ? (
              <Select block value={run.id} onChange={(e) => setRunId(e.target.value)} aria-label="Рассылка" end={status}>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatTime(r.queuedAt)}
                    {r.id !== run.id && ` — ${RUN_STATE[r.status].text}`}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="flex min-h-control min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold tabular-nums">{formatTime(run.queuedAt)}</span>
                {status}
              </span>
            )}
          </div>
          <ExportButtons onExport={report}>
            {(run.status === 'DONE' || run.status === 'FAILED') && run.progress.failed > 0 && (
              <Button className="col-span-2" onClick={retry}>
                <RotateCcw size={15} /> Повторить ошибки
              </Button>
            )}
          </ExportButtons>
        </div>
      </div>

      {run.waiting && (
        <p className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', toneSurface.warn)}>
          <Clock size={16} aria-hidden className="shrink-0" />
          <span>Не отправляется: {run.waiting}</span>
        </p>
      )}

      <div role="group" aria-label="Итоги рассылки" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              'min-w-0 cursor-pointer rounded-lg border px-3 py-2 text-left',
              TRANSITION,
              FOCUS_RING,
              filter === t.key ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
            )}
          >
            <div className={cn('text-lg leading-tight font-semibold tabular-nums', t.tone)}>{counts[t.key]}</div>
            <div className="text-caption [overflow-wrap:anywhere] text-muted">{t.label}</div>
          </button>
        ))}
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Найти группу" />

      <Paged items={shown}>
        {(visible) => (
          <div role="list" aria-label="Группы рассылки" className="max-h-[min(60dvh,480px)] overflow-auto overscroll-contain rounded-xl border border-border bg-surface">
            {isPending && <p className="p-3 text-sm text-muted">Загрузка…</p>}
            {!isPending && !deliveries.length && <EmptyState inset>{run.waiting ? 'Рассылка ещё не начиналась — причина выше.' : 'Рассылка ещё не начиналась.'}</EmptyState>}
            {!isPending && deliveries.length > 0 && !shown.length && <EmptyState inset>Ничего не найдено</EmptyState>}
            {visible.map((d) => {
              const waiting = d.status === 'PENDING' && d.error
              const state = waiting ? { text: 'пауза', tone: 'warn' as Tone } : GROUP_STATE[d.status]
              return (
                <div role="listitem" key={d.groupJid} className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{d.groupName ?? d.groupJid}</span>
                    {d.error && <span className="block truncate text-caption text-muted">{deliveryReason(d.error)}</span>}
                    {d.sentAt && (
                      <time dateTime={d.sentAt} className="block truncate text-caption text-muted tabular-nums">
                        отправлено {formatTime(d.sentAt)}
                      </time>
                    )}
                  </span>
                  <span className="flex w-28 shrink-0 justify-end">
                    <Badge tone={state.tone}>{state.text}</Badge>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Paged>
    </section>
  )
}
