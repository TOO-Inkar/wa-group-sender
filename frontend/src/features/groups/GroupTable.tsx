import { toast } from 'sonner'
import { useResetRejections } from './api'
import { GroupName, GroupTags } from './GroupTags'
import { sendable } from './model'
import type { Group } from '@/shared/api/types'

export function GroupTable({
  groups,
  selected,
  onToggle,
  empty,
}: {
  groups: Group[]
  selected: Set<string>
  onToggle: (jids: string[], on: boolean) => void
  empty: string
}) {
  const reset = useResetRejections()
  const selectable = groups.filter(sendable).map((g) => g.jid)
  const resetGroup = (jid: string) => reset.mutate(jid, { onSuccess: () => toast.success('Группа вернётся в рассылку') })
  const allSelected = selectable.length > 0 && selectable.every((j) => selected.has(j))

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="w-10 py-2.5 pl-3">
              <input type="checkbox" className="size-4 accent-accent" checked={allSelected} onChange={(e) => onToggle(selectable, e.target.checked)} aria-label="Отметить все показанные" />
            </th>
            <th className="px-3 py-2.5 font-medium">Группа</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Состояние</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.jid} className="border-b border-border last:border-b-0 hover:bg-surface-2">
              <td className="py-2 pl-3">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={selected.has(g.jid)}
                  disabled={!sendable(g)}
                  onChange={(e) => onToggle([g.jid], e.target.checked)}
                  aria-label={g.name ?? g.jid}
                />
              </td>
              <td className="px-3 py-2 [overflow-wrap:anywhere]">
                <GroupName group={g} />
                {/* Телефон: состояние под названием, без второй колонки. */}
                <span className="mt-1 block sm:hidden">
                  <GroupTags group={g} onReset={resetGroup} />
                </span>
              </td>
              <td className="hidden px-3 py-2 sm:table-cell">
                <GroupTags group={g} onReset={resetGroup} />
              </td>
            </tr>
          ))}
          {!groups.length && (
            <tr>
              <td colSpan={3} className="p-4 text-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
