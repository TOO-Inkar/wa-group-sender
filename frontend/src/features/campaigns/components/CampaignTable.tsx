import { Ban, Pencil, Play, Send, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useCampaignCommands } from '../commands'
import { campaignState, latestRun, percent, scheduleShort, STATE, whereText } from '../model'
import type { Campaign } from '@/shared/api/types'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { RowMenu } from '@/shared/ui/menu'
import { ProgressBar } from '@/shared/ui/progress-bar'

function Progress({ c }: { c: Campaign }) {
  const run = latestRun(c)
  const p = run?.progress
  if (!p?.total) return <span className="text-[13px] text-muted">{run && run.status !== 'QUEUED' ? 'не отправлялась' : 'не начата'}</span>
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px] tabular-nums">
        <span>
          <b>{p.sent}</b>
          <span className="text-muted">/{p.total}</span>
        </span>
        {p.failed > 0 && <span className="text-bad-text">ошибок {p.failed}</span>}
      </div>
      <ProgressBar percent={percent(run)} />
    </div>
  )
}

function actions(c: Campaign, cmd: ReturnType<typeof useCampaignCommands>) {
  return [
    { label: 'Изменить', icon: <Pencil size={15} />, onSelect: () => cmd.edit(c) },
    { label: 'Отправить сейчас', icon: <Send size={15} />, onSelect: () => cmd.sendNow(c), disabled: !!c.current },
    { label: 'Выключить', icon: <Ban size={15} />, onSelect: () => cmd.disable(c), hidden: !(c.enabled || c.current) },
    { label: 'Включить расписание', icon: <Play size={15} />, onSelect: () => cmd.enable(c), hidden: c.enabled || !!c.current || c.repeatMode === 'ONCE' },
    { label: 'Удалить', icon: <Trash2 size={15} />, onSelect: () => cmd.remove(c), danger: true },
  ]
}

const when = (c: Campaign) =>
  c.enabled && c.nextRunAt && !c.current ? `след. ${formatTime(c.nextRunAt)}` : c.lastRunAt ? `посл. ${formatTime(c.lastRunAt)}` : `создана ${formatTime(c.createdAt)}`

export function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  const navigate = useNavigate()
  const cmd = useCampaignCommands()

  return (
    <>
      {/* Телефон и планшет: строка-карточка вместо таблицы на 720px. */}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface lg:hidden">
        {campaigns.map((c) => {
          const state = STATE[campaignState(c)]
          return (
            <li key={c.id} className="relative flex gap-2 py-3 pr-2 pl-4">
              <Link to={`/campaigns/${c.id}`} className="grid min-w-0 flex-1 gap-1.5 after:absolute after:inset-0">
                <span className="line-clamp-2 font-semibold [overflow-wrap:anywhere]">
                  <span className="font-normal text-muted tabular-nums">№{c.id}</span> {c.title}
                </span>
                <span className="truncate text-[13px] text-muted">→ {whereText(c)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <Badge tone={state.tone}>{state.text}</Badge>
                  <span className="text-muted tabular-nums">
                    {scheduleShort(c)} · {when(c)}
                  </span>
                </span>
                <span className="mt-0.5 max-w-64">
                  <Progress c={c} />
                </span>
              </Link>
              <span className="relative z-10 self-start">
                <RowMenu items={actions(c, cmd)} />
              </span>
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="w-32 px-3 py-2.5 font-medium">Статус</th>
              <th className="px-3 py-2.5 font-medium">Заявка</th>
              <th className="w-56 px-3 py-2.5 font-medium">Когда</th>
              <th className="w-44 px-3 py-2.5 font-medium">Отправлено</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const state = STATE[campaignState(c)]
              return (
                <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 align-middle">
                    <Badge tone={state.tone}>{state.text}</Badge>
                  </td>
                  <td className="max-w-0 px-3 py-2.5">
                    <div className="truncate font-semibold" title={c.title}>
                      <span className="font-normal text-muted tabular-nums">№{c.id}</span> {c.title}
                    </div>
                    <div className="truncate text-[13px] text-muted">→ {whereText(c)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="truncate">{scheduleShort(c)}</div>
                    <div className="text-[13px] text-muted tabular-nums">{when(c)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Progress c={c} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <RowMenu items={actions(c, cmd)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
