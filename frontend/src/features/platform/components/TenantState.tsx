import type { TenantOverview } from '../api'
import { isBlocked, proxyState } from '../model'
import { dispatcherInfo, SESSION_TEXT, sessionTone } from '@/features/health/texts'
import { Badge, Dot } from '@/shared/ui/badge'

export function SessionBadge({ t }: { t: TenantOverview }) {
  return <Badge tone={isBlocked(t) ? 'neutral' : sessionTone(t.session)}>{SESSION_TEXT[t.session] ?? t.session}</Badge>
}

export function DispatcherText({ t }: { t: TenantOverview }) {
  const info = t.stoppedByRisk ? dispatcherInfo('stopped-by-risk') : dispatcherInfo(t.dispatcher)
  return (
    <span title={info.hint} className="flex min-w-0 items-center gap-1.5">
      <Dot tone={isBlocked(t) ? 'neutral' : info.tone} />
      <span className="truncate">{info.text}</span>
    </span>
  )
}

export function TenantBadges({ t, quiet }: { t: TenantOverview; quiet?: boolean }) {
  const state = proxyState(t)
  const proxy = quiet && state?.tone === 'neutral' ? null : state
  return (
    <>
      {isBlocked(t) && <Badge tone="bad">Заблокирован</Badge>}
      {proxy && <Badge tone={proxy.tone}>{proxy.text}</Badge>}
    </>
  )
}
