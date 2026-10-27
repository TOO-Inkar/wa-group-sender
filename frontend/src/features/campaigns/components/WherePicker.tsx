import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { FormValues } from '../form'
import { GroupPickerDialog } from '@/features/groups/GroupPickerDialog'
import { lastGroupPick } from '@/features/groups/lastPick'
import { useGroupLists } from '@/features/groups/api'
import { useHealth } from '@/features/health/api'
import { groupsCount } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Caption, Select } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'

export function WherePicker() {
  const { setValue, control, formState, register } = useFormContext<FormValues>()
  const [target, groups] = useWatch({ control, name: ['target', 'groups'] })
  const [picking, setPicking] = useState(false)
  const pick = () => {
    if (!groups.length) setValue('groups', lastGroupPick())
    setPicking(true)
  }
  const { data: lists = [] } = useGroupLists()
  const { data: health } = useHealth()
  const error = formState.errors.listId?.message ?? formState.errors.groups?.message

  return (
    <section className="grid gap-2">
      <Caption>Куда</Caption>
      <Segmented
        stretch
        value={target}
        onChange={(v) => {
          setValue('target', v)
          if (v === 'pick' && !groups.length) pick()
        }}
        options={[
          { value: 'all', label: 'Все группы', count: health?.activeGroups },
          { value: 'list', label: 'Список' },
          { value: 'pick', label: 'Выбрать' },
        ]}
      />
      {target === 'list' && (
        <Select className="text-sm" aria-invalid={!!error} {...register('listId')}>
          <option value="">{lists.length ? '— список —' : 'списков нет'}</option>
          {lists.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name} · {l.groups.length}
            </option>
          ))}
        </Select>
      )}
      {target === 'pick' && (
        <Button className="justify-self-start" onClick={pick}>
          {groups.length ? `${groupsCount(groups.length)} · изменить` : 'Выбрать группы…'}
        </Button>
      )}
      {error && <span className="text-[13px] text-danger">{error}</span>}
      <GroupPickerDialog open={picking} onOpenChange={setPicking} value={groups} onChange={(jids) => setValue('groups', jids, { shouldValidate: formState.isSubmitted })} />
    </section>
  )
}
