import { toast } from 'sonner'
import { useResetRejections } from './api'
import { GroupName, GroupRow, GroupTags } from './GroupTags'
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
  const selectAll = (
    <input
      type="checkbox"
      className="size-4 accent-accent"
      checked={allSelected}
      disabled={!selectable.length}
      onChange={(e) => onToggle(selectable, e.target.checked)}
      aria-label="Отметить все показанные"
    />
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="sm:hidden">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-3 text-xs font-medium text-muted">
          {selectAll}
          Группа
        </label>
        <div className="divide-y divide-border">
          {groups.map((g) => (
            <GroupRow key={g.jid} group={g} checked={selected.has(g.jid)} disabled={!sendable(g)} onChange={(on) => onToggle([g.jid], on)} onReset={resetGroup} />
          ))}
        </div>
        {!groups.length && <p className="p-4 text-muted">{empty}</p>}
      </div>
      <table className="hidden w-full table-fixed border-collapse text-left text-sm sm:table">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="w-12 py-3 pl-4">{selectAll}</th>
            <th className="px-3 py-3 font-medium">Группа</th>
            <th className="w-2/5 px-3 py-3 font-medium">Состояние</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.jid} className="border-b border-border last:border-b-0 hover:bg-surface-2">
              <td className="py-2.5 pl-4">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={selected.has(g.jid)}
                  disabled={!sendable(g)}
                  onChange={(e) => onToggle([g.jid], e.target.checked)}
                  aria-label={g.name ?? g.jid}
                />
              </td>
              <td className="px-3 py-2.5">
                <GroupName group={g} />
              </td>
              <td className="px-3 py-2.5">
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
