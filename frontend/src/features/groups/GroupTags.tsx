import { useState } from 'react'
import type { Group } from '@/shared/api/types'
import { cn } from '@/shared/lib/cn'
import { plural } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxInput } from '@/shared/ui/input'

function GroupTitle({ group }: { group: Group }) {
  return group.name ? (
    <span className="line-clamp-2 min-w-0 font-semibold [overflow-wrap:anywhere]">{group.name}</span>
  ) : (
    <span className="text-muted italic">Без названия</span>
  )
}

export function GroupRow({
  group,
  checked,
  disabled,
  onChange,
  onReset,
}: {
  group: Group
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  onReset?: (jid: string) => void
}) {
  return (
    <label
      className={cn(
        'flex min-h-14 items-center gap-3 px-3 py-2 text-sm transition-colors',
        disabled ? 'cursor-default opacity-55' : 'cursor-pointer hover:bg-surface-2',
        checked && 'bg-accent-soft hover:bg-accent-soft',
      )}
    >
      <CheckboxInput checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={group.name ?? group.jid} />
      <GroupAvatar group={group} />
      <span className="grid min-w-0 flex-1 gap-1">
        <GroupTitle group={group} />
        <GroupTags group={group} onReset={onReset} />
      </span>
    </label>
  )
}

function GroupAvatar({ group }: { group: Group }) {
  const [failed, setFailed] = useState(false)
  const initial = group.name?.match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '?'
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-border text-xs font-semibold text-muted" aria-hidden>
      {failed ? initial : <img src={`/api/groups/${encodeURIComponent(group.jid)}/picture`} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />}
    </span>
  )
}

export function GroupTags({ group, onReset }: { group: Group; onReset?: (jid: string) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {group.active ? <Badge tone="ok">в рассылке</Badge> : !group.archived && <Badge>не в архиве</Badge>}
      {group.community ? (
        <Badge tone="warn" title="В само сообщество писать нельзя, только в его группу объявлений">
          сообщество
        </Badge>
      ) : group.member === false ? (
        <Badge tone="bad">номер не в группе</Badge>
      ) : group.canSend === false ? (
        <Badge tone="warn">пишут только админы</Badge>
      ) : null}
      {group.rejected ? (
        <>
          <Badge tone="bad" title="WhatsApp отклонил отправку в трёх рассылках подряд (ошибка 479)">
            WhatsApp отклоняет
          </Badge>
          {onReset && (
            <Button variant="link" size="inline" onClick={() => onReset(group.jid)}>
              вернуть в рассылку
            </Button>
          )}
        </>
      ) : (
        group.rejectedCount > 0 && <Badge tone="warn">был отказ</Badge>
      )}
      {group.participants != null && <Badge>{plural(group.participants, 'участник', 'участника', 'участников')}</Badge>}
    </span>
  )
}
