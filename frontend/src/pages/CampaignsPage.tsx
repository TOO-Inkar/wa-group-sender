import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useCampaigns } from '@/features/campaigns/api'
import { CampaignTable } from '@/features/campaigns/components/CampaignTable'
import { matchesFilter, matchesQuery, type CampaignFilter } from '@/features/campaigns/model'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/empty-state'
import { SearchInput } from '@/shared/ui/search-input'
import { Segmented } from '@/shared/ui/segmented'
import { buttonVariants } from '@/shared/ui/styles'

export function CampaignsPage() {
  const { data: campaigns = [], isPending } = useCampaigns()
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [query, setQuery] = useState('')
  const [report, setReport] = useState(false)

  const group = (f: CampaignFilter) => campaigns.filter((c) => matchesFilter(c, f))
  const shown = group(filter).filter((c) => matchesQuery(c, query))

  return (
    <>
      <div className="mb-3 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Заявки</h1>
          <span className="flex items-center gap-2">
            <Button onClick={() => setReport(true)}>Отчёт</Button>
            <Link to="/campaigns/new" className={buttonVariants({ variant: 'primary' })}>
              <Plus size={16} /> Заявка
            </Link>
          </span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <Segmented
            stretch
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
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск по заявкам" />
        </div>
      </div>
      {isPending ? (
        <p className="text-muted">Загрузка…</p>
      ) : shown.length ? (
        <CampaignTable campaigns={shown} />
      ) : (
        <EmptyState
          action={
            !campaigns.length && (
              <Link to="/campaigns/new" className={buttonVariants({ variant: 'primary' })}>
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
