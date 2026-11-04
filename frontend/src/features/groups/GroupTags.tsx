import { useState } from 'react'
import type { Group, GroupBlock } from '@/shared/api/types'
import { cn } from '@/shared/lib/cn'
import { plural } from '@/shared/lib/format'
import { Badge, type Tone } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxInput } from '@/shared/ui/input'
import { TRANSITION } from '@/shared/ui/styles'

function GroupTitle({ group }: { group: Group }) {
  return group.name ? (
    <span className="line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere]">{group.name}</span>
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
        'flex min-h-14 items-center gap-3 px-[var(--row-x,0.75rem)] py-2 text-sm',
        TRANSITION,
        disabled ? 'cursor-default text-muted' : 'cursor-pointer hover:bg-surface-2',
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
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-bg text-xs font-semibold text-muted" aria-hidden>
      {failed ? initial : <img src={`/api/groups/${encodeURIComponent(group.jid)}/picture`} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />}
    </span>
  )
}

const BLOCKED: Record<GroupBlock, { text: string; tone: Tone; hint: string }> = {
  COMMUNITY: { text: 'сообщество', tone: 'warn', hint: 'в само сообщество писать нельзя, только в его группу объявлений' },
  NOT_MEMBER: { text: 'номер не в группе', tone: 'bad', hint: 'добавьте номер в группу и нажмите «Обновить»' },
  ADMINS_ONLY: { text: 'пишут только админы', tone: 'warn', hint: 'сделайте номер админом группы или разрешите писать всем' },
  TOO_LARGE: { text: 'слишком большая', tone: 'warn', hint: 'участников больше лимита из настроек' },
  REJECTED: { text: 'WhatsApp отклоняет', tone: 'bad', hint: 'WhatsApp отклонил отправку в трёх рассылках подряд (ошибка 479)' },
  NOT_ARCHIVED: { text: 'не в архиве', tone: 'warn', hint: 'рассылка идёт только по архиву: заархивируйте группу в WhatsApp и нажмите «Обновить»' },
  SEND_FAILED: { text: 'ошибка отправки', tone: 'bad', hint: 'WhatsApp не дал отправить в группу — нажмите «Обновить», чтобы проверить снова' },
}

export function GroupTags({ group, onReset }: { group: Group; onReset?: (jid: string) => void }) {
  const blocked = group.blockedBy ? BLOCKED[group.blockedBy] : null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {blocked ? <Badge tone={blocked.tone}>{blocked.text}</Badge> : <Badge tone="ok">в рассылке</Badge>}
      {group.blockedBy === 'REJECTED' && onReset && (
        <Button variant="link" size="inline" onClick={() => onReset(group.jid)}>
          вернуть в рассылку
        </Button>
      )}
      {!group.rejected && group.rejectedCount > 0 && <Badge tone="warn">был отказ</Badge>}
      {group.participants != null && <Badge>{plural(group.participants, 'участник', 'участника', 'участников')}</Badge>}
      {blocked && <span className="basis-full text-caption text-muted">{blocked.hint}</span>}
    </span>
  )
}
