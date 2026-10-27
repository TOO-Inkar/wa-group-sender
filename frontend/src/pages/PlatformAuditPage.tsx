import { useSearchParams } from 'react-router'
import { useAudit, useTenants, type AuditEntry } from '@/features/platform/api'
import { ALERT_ACTIONS, auditActionText } from '@/features/platform/model'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { EmptyState } from '@/shared/ui/empty-state'
import { Select } from '@/shared/ui/input'

const ALL = ''
const TENANT_PARAM = 'tenant'

function Action({ e }: { e: AuditEntry }) {
  return <Badge tone={ALERT_ACTIONS.has(e.action) ? 'bad' : 'neutral'}>{auditActionText(e.action)}</Badge>
}

const tenantText = (e: AuditEntry) => e.tenantName ?? (e.tenantId === null ? 'платформа' : `№${e.tenantId}`)

export function PlatformAuditPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get(TENANT_PARAM) ?? ALL
  const tenantId = raw === ALL ? null : Number(raw)
  const { data: tenants = [] } = useTenants()
  const { data: entries = [], isPending, error } = useAudit(tenantId)

  const choose = (value: string) => setParams(value === ALL ? {} : { [TENANT_PARAM]: value }, { replace: true })

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Журнал</h1>
        <Select value={raw} onChange={(e) => choose(e.target.value)} aria-label="Кабинет" className="min-w-56">
          <option value={ALL}>Все кабинеты</option>
          {tenants.map((t) => (
            <option key={t.id} value={String(t.id)}>
              №{t.id} {t.name}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <EmptyState>{error.message}</EmptyState>
      ) : isPending ? (
        <p className="text-muted">Загрузка…</p>
      ) : !entries.length ? (
        <EmptyState>Записей нет.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface xl:hidden">
            {entries.map((e, i) => (
              <li key={`${e.at}-${i}`} className="grid gap-1 px-4 py-2.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Action e={e} />
                  <span className="text-[13px] text-muted tabular-nums">{formatTime(e.at)}</span>
                </span>
                <span className="text-sm">
                  <b>{e.actor ?? '—'}</b> <span className="text-muted">· {tenantText(e)}</span>
                </span>
                {(e.detail || e.ip) && <span className="text-[13px] [overflow-wrap:anywhere] text-muted">{[e.detail, e.ip].filter(Boolean).join(' · ')}</span>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface xl:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="w-28 px-3 py-2.5 font-medium">Когда</th>
                  <th className="w-48 px-3 py-2.5 font-medium">Действие</th>
                  <th className="w-36 px-3 py-2.5 font-medium">Кто</th>
                  <th className="w-44 px-3 py-2.5 font-medium">Кабинет</th>
                  <th className="px-3 py-2.5 font-medium">Подробности</th>
                  <th className="w-32 px-3 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.at}-${i}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-muted tabular-nums">{formatTime(e.at)}</td>
                    <td className="px-3 py-2">
                      <Action e={e} />
                    </td>
                    <td className="truncate px-3 py-2" title={e.actor ?? undefined}>{e.actor ?? '—'}</td>
                    <td className="truncate px-3 py-2" title={tenantText(e)}>{tenantText(e)}</td>
                    <td className="truncate px-3 py-2 text-muted" title={e.detail ?? undefined}>{e.detail ?? ''}</td>
                    <td className="truncate px-3 py-2 text-muted tabular-nums">{e.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
