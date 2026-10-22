import type { Group } from '@/shared/api/types'
import { plural } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'

export function GroupName({ group }: { group: Group }) {
  return group.name ? (
    <span className="font-semibold [overflow-wrap:anywhere]">{group.name}</span>
  ) : (
    <span className="text-muted italic">Без названия</span>
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
          <Badge tone="bad" title="WhatsApp дважды подряд отклонил отправку (ошибка 479)">
            WhatsApp отклоняет
          </Badge>
          {onReset && (
            <button type="button" className="cursor-pointer text-[13px] text-muted underline hover:text-text" onClick={() => onReset(group.jid)}>
              вернуть в рассылку
            </button>
          )}
        </>
      ) : (
        group.rejectedCount > 0 && <Badge tone="warn">был отказ</Badge>
      )}
      {group.participants != null && <Badge>{plural(group.participants, 'участник', 'участника', 'участников')}</Badge>}
    </span>
  )
}
