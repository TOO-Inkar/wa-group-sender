import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { FormValues } from '../form'
import { GroupPickerDialog } from '@/features/groups/GroupPickerDialog'
import { useGroupLists } from '@/features/groups/api'
import { useHealth } from '@/features/health/api'
import { plural } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/input'
import { Option, OptionGroup } from './Option'

export function TargetSection() {
  const { register, setValue, control, formState } = useFormContext<FormValues>()
  const [picking, setPicking] = useState(false)
  const groups = useWatch({ control, name: 'groups' })
  const { data: lists = [] } = useGroupLists()
  const { data: health } = useHealth()
  const active = health?.activeGroups ?? 0

  return (
    <OptionGroup legend="Куда отправить" error={formState.errors.listId?.message ?? formState.errors.groups?.message}>
      <Option name="target" value="all" title="Все активные группы">
        {active ? `${plural(active, 'группа', 'группы', 'групп')} из «Архива», где номер может писать` : 'сейчас таких групп нет — заявка подождёт'}
      </Option>
      <Option name="target" value="list" title="Сохранённый список">
        <Select {...register('listId', { onChange: () => setValue('target', 'list') })} disabled={!lists.length}>
          {lists.length ? (
            <>
              <option value="">— выберите список —</option>
              {lists.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name} — {plural(l.groups.length, 'группа', 'группы', 'групп')}
                </option>
              ))}
            </>
          ) : (
            <option value="">Списков пока нет — создайте на вкладке «Группы»</option>
          )}
        </Select>
      </Option>
      <Option name="target" value="pick" title="Выбрать группы">
        <span>{groups.length ? `выбрано: ${plural(groups.length, 'группа', 'группы', 'групп')}` : 'любые группы, куда номер может писать'}</span>
        <Button
          size="sm"
          onClick={() => {
            setValue('target', 'pick')
            setPicking(true)
          }}
        >
          Выбрать…
        </Button>
      </Option>
      <GroupPickerDialog
        open={picking}
        onOpenChange={setPicking}
        value={groups}
        onChange={(jids) => setValue('groups', jids, { shouldValidate: formState.isSubmitted })}
      />
    </OptionGroup>
  )
}
