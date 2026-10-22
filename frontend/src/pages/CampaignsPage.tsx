import { useState } from 'react'
import { Link } from 'react-router'
import { useCampaigns } from '@/features/campaigns/api'
import { CampaignCard } from '@/features/campaigns/components/CampaignCard'
import { campaignState, type CampaignState } from '@/features/campaigns/model'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Chips, EmptyState, PageHeader } from '@/shared/ui/misc'

type Filter = '' | 'sending' | CampaignState

const FILTERS: { value: Filter; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'sending', label: 'Рассылаются' },
  { value: 'scheduled', label: 'По расписанию' },
  { value: 'done', label: 'Завершены' },
  { value: 'off', label: 'Выключены' },
]

export function CampaignsPage() {
  const { data: campaigns = [], isPending } = useCampaigns()
  const [filter, setFilter] = useState<Filter>('')
  const [query, setQuery] = useState('')
  const [report, setReport] = useState(false)

  const q = query.trim().toLowerCase()
  const shown = campaigns.filter((c) => {
    const state = campaignState(c)
    if (filter === 'sending' ? state !== 'sending' && state !== 'waiting' : filter && state !== filter) return false
    return !q || c.title.toLowerCase().includes(q) || c.message.toLowerCase().includes(q)
  })

  return (
    <>
      <PageHeader
        title="Заявки"
        lead="Нажмите на заявку: текст, куда ушла, расписание и рассылки по каждой группе."
        actions={
          <>
            <Button onClick={() => setReport(true)}>Отчёт для заказчика</Button>
            <Link to="/campaigns/new" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-text hover:bg-accent-hover">
              + Новая заявка
            </Link>
          </>
        }
      />
      <Chips value={filter} options={FILTERS} onChange={setFilter} />
      <Input type="search" placeholder="Поиск по маршруту или тексту" className="mb-3" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="grid gap-3">
        {isPending ? (
          <p className="text-muted">Загрузка…</p>
        ) : shown.length ? (
          shown.map((c) => <CampaignCard key={c.id} campaign={c} />)
        ) : (
          <EmptyState
            action={
              !campaigns.length && (
                <Link to="/campaigns/new" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-text">
                  Создать первую заявку
                </Link>
              )
            }
          >
            {campaigns.length ? 'Таких заявок нет.' : 'Заявок пока нет.'}
          </EmptyState>
        )}
      </div>
      <ReportDialog open={report} onOpenChange={setReport} />
    </>
  )
}
