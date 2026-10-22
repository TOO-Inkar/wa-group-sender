import { Clock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCampaignAction, useDeliveries } from '../api'
import { deliveryReason, RUN_STATE } from '../model'
import type { Delivery, DeliveryStatus, Run } from '@/shared/api/types'
import { download } from '@/shared/lib/download'
import { formatTime } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { Badge, type Tone } from '@/shared/ui/badge'
import { toneSurface } from '@/shared/ui/tone'
import { Button } from '@/shared/ui/button'
import { useConfirm } from '@/shared/ui/confirm-context'
import { Input, Select } from '@/shared/ui/input'

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

  if (!run) return <p className="text-sm text-muted">Рассылок ещё не было.</p>

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
  const report = (format: 'xlsx' | 'pdf') =>
    download(`/api/admin/reports/requests/${encodeURIComponent(run.id)}?format=${format}`, `wa-report-${run.id}.${format}`).catch((e: Error) => toast.error(e.message))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {runs.length > 1 ? (
          <Select value={run.id} onChange={(e) => setRunId(e.target.value)} className="py-1.5 text-sm" aria-label="Рассылка">
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {formatTime(r.queuedAt)} — {RUN_STATE[r.status].text}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-sm font-semibold">{formatTime(run.queuedAt)}</span>
        )}
        <Badge tone={RUN_STATE[run.status].tone}>{RUN_STATE[run.status].text}</Badge>
        <span className="ml-auto flex gap-1.5">
          {(run.status === 'DONE' || run.status === 'FAILED') && run.progress.failed > 0 && (
            <Button size="sm" onClick={retry}>
              <RotateCcw size={14} /> Повторить ошибки
            </Button>
          )}
          <Button size="sm" onClick={() => report('xlsx')}>
            Excel
          </Button>
          <Button size="sm" onClick={() => report('pdf')}>
            PDF
          </Button>
        </span>
      </div>

      {run.waiting && (
        <p className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', toneSurface.warn)}>
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>Не отправляется: {run.waiting}</span>
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1.5">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn('cursor-pointer rounded-xl border px-2 py-2 text-left', filter === t.key ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2')}
          >
            <div className={cn('text-lg leading-tight font-bold tabular-nums', t.tone)}>{counts[t.key]}</div>
            <div className="truncate text-xs text-muted">{t.label}</div>
          </button>
        ))}
      </div>

      <Input type="search" placeholder="Найти группу" value={query} onChange={(e) => setQuery(e.target.value)} className="py-1.5 text-sm" />

      <div className="max-h-[52vh] overflow-auto rounded-xl border border-border bg-surface">
        {isPending && <p className="p-3 text-sm text-muted">Загрузка…</p>}
        {!isPending && !deliveries.length && <p className="p-3 text-sm text-muted">{run.waiting ? 'Рассылка ещё не начиналась — причина выше.' : 'Рассылка ещё не начиналась.'}</p>}
        {!isPending && deliveries.length > 0 && !shown.length && <p className="p-3 text-sm text-muted">Ничего не найдено.</p>}
        {shown.map((d) => {
          const waiting = d.status === 'PENDING' && d.error
          const state = waiting ? { text: 'пауза', tone: 'warn' as Tone } : GROUP_STATE[d.status]
          return (
            <div key={d.groupJid} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <span className="min-w-0 text-sm">
                <span className="block truncate">{d.groupName ?? d.groupJid}</span>
                {d.error && <span className="block truncate text-xs text-muted">{deliveryReason(d.error)}</span>}
              </span>
              <Badge tone={state.tone}>{state.text}</Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}
