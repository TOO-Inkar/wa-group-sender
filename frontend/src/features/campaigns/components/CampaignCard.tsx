import { Link } from 'react-router'
import { campaignState, latestRun, metaLine, percent, STATE } from '../model'
import type { Campaign } from '@/shared/api/types'
import { Badge } from '@/shared/ui/badge'
import { ProgressBar } from '@/shared/ui/misc'

/** Заявка в списке: состояние, название, прогресс последней рассылки, кому и когда. */
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const state = STATE[campaignState(campaign)]
  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className="grid gap-2 rounded-xl border border-border bg-surface px-4.5 py-3.5 shadow-sm transition-colors hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge tone={state.tone}>{state.text}</Badge>
        <span className="truncate font-semibold">
          №{campaign.id} · {campaign.title}
        </span>
      </div>
      <ProgressBar percent={percent(latestRun(campaign))} />
      <div className="text-[13px] text-muted">{metaLine(campaign)}</div>
    </Link>
  )
}
