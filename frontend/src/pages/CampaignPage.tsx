import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useCampaign } from '@/features/campaigns/api'
import { CampaignActions } from '@/features/campaigns/components/CampaignActions'
import { RunList } from '@/features/campaigns/components/RunList'
import { campaignState, metaLine, scheduleText, STATE, whereText } from '@/features/campaigns/model'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Card, CardTitle } from '@/shared/ui/card'
import { EmptyState, WhatsAppBubble } from '@/shared/ui/misc'

export function CampaignPage() {
  const { id } = useParams()
  const { data: c, isPending, isError } = useCampaign(id)
  if (isPending) return <p className="text-muted">Загрузка…</p>
  if (isError || !c) return <EmptyState action={<Link to="/campaigns">← К заявкам</Link>}>Заявка не найдена или удалена.</EmptyState>
  const state = STATE[campaignState(c)]

  return (
    <>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> Заявки
      </Link>
      <div className="mb-4 grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={state.tone}>{state.text}</Badge>
          <h1 className="text-[22px] font-semibold">
            №{c.id} · {c.title}
          </h1>
        </div>
        <p className="text-[13px] text-muted">{metaLine(c)}</p>
        <CampaignActions campaign={c} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <WhatsAppBubble text={c.message} />
          <Card>
            <CardTitle>Куда</CardTitle>
            {c.targeted ? (
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  {whereText(c)} ({c.targets.length})
                </summary>
                <ul className="mt-2 grid max-h-48 list-disc gap-0.5 overflow-auto pl-5 text-sm text-muted">
                  {c.targets.map((t) => (
                    <li key={t.jid}>{t.name}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="text-sm text-muted">Все активные группы на момент рассылки.</p>
            )}
            <CardTitle className="mt-4">Когда</CardTitle>
            <p className="text-sm text-muted">
              {scheduleText(c)}
              {c.enabled && c.nextRunAt ? `, следующая — ${formatTime(c.nextRunAt)}` : ''}
              {!c.enabled && c.repeatMode !== 'ONCE' ? ', расписание выключено' : ''}.
            </p>
          </Card>
        </div>
        <Card>
          <CardTitle>
            Рассылки{c.runCount > c.runs.length ? ` (последние ${c.runs.length} из ${c.runCount})` : ''}
          </CardTitle>
          <RunList runs={c.runs} />
        </Card>
      </div>
    </>
  )
}
