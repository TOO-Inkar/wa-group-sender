import { CopyButton } from '@/shared/ui/copy-button'

export type Credential = { label: string; value: string }

export function Credentials({ rows }: { rows: Credential[] }) {
  return (
    <div className="grid gap-3">
      <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-text">
        Пароль показывается один раз — скопируйте и передайте клиенту.
      </p>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 py-1 pr-1 pl-3">
            <dt className="w-16 shrink-0 text-[13px] text-muted">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[15px] select-all" aria-label={row.label}>
              {row.value}
            </dd>
            <CopyButton value={row.value} label={`Скопировать: ${row.label.toLowerCase()}`} />
          </div>
        ))}
      </dl>
      <CopyButton className="justify-self-start" value={rows.map((r) => `${r.label}: ${r.value}`).join('\n')} text="Скопировать всё" />
    </div>
  )
}
