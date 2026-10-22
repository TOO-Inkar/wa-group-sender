import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useCampaigns } from '@/features/campaigns/api'
import { CampaignTable } from '@/features/campaigns/components/CampaignTable'
import { campaignState } from '@/features/campaigns/model'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmptyState } from '@/shared/ui/misc'
import { Segmented } from '@/shared/ui/segmented'

type Filter = 'all' | 'active' | 'scheduled' | 'done' | 'off'

/** Рабочий экран: заявки таблицей; создание, правка и просмотр — в панели справа (вложенные маршруты). */
export function CampaignsPage() {
  const { data: campaigns = [], isPending } = useCampaigns()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [report, setReport] = useState(false)

  const group = (f: Filter) =>
    campaigns.filter((c) => {
      const s = campaignState(c)
      return f === 'all' || (f === 'active' ? s === 'sending' || s === 'waiting' : s === f)
    })
  const q = query.trim().toLowerCase()
  const shown = group(filter).filter((c) => !q || c.title.toLowerCase().includes(q) || c.message.toLowerCase().includes(q))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Заявки</h1>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все', count: campaigns.length },
            { value: 'active', label: 'Идут', count: group('active').length },
            { value: 'scheduled', label: 'По расписанию', count: group('scheduled').length },
            { value: 'done', label: 'Завершены', count: group('done').length },
            { value: 'off', label: 'Выключены', count: group('off').length },
          ]}
        />
        <Input type="search" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full py-1.5 text-sm sm:ml-auto sm:w-56" />
        <Button size="sm" onClick={() => setReport(true)}>
          Отчёт
        </Button>
        <Link to="/campaigns/new" className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text hover:bg-accent-hover">
          <Plus size={16} /> Заявка
        </Link>
      </div>
      {isPending ? (
        <p className="text-muted">Загрузка…</p>
      ) : shown.length ? (
        <CampaignTable campaigns={shown} />
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
          {campaigns.length ? 'Ничего не найдено.' : 'Заявок пока нет.'}
        </EmptyState>
      )}
      <ReportDialog open={report} onOpenChange={setReport} />
      <Outlet />
    </>
  )
}
